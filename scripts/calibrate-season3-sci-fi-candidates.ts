import fs from 'node:fs/promises';
import path from 'node:path';
import { selectBalancedCandidates } from '../src/lib/seasons/season3/calibration-balance';
import { deduplicateFranchiseSequels } from '../src/lib/seasons/season3/franchise-deduplication';
import { SEASON3_SCI_FI_NODE_SLUGS } from '../src/lib/seasons/season3/taxonomy';

type NodeProb = {
  nodeSlug: string;
  probability: number;
  threshold: number;
};

type ScoredCandidate = {
  tmdbId: number;
  title: string;
  year: number | null;
  genreIds?: number[];
  voteCount?: number | null;
  voteAverage?: number | null;
  popularity?: number | null;
  overview?: string | null;
  discoveryReasons?: string[];
  discoveryScore?: number;
  sciFiScore: number;
  topNodes?: NodeProb[];
};

type ScoredFile = {
  candidates?: ScoredCandidate[];
};

const INPUT_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-candidates-scored.json');
const OUTPUT_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-candidates-calibrated.json');
const REPORT_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-candidates-calibration.md');

const SCI_FI_GENRE_ID = 878;
// Aligned with the 12-node Season 3 sci-fi curriculum ontology.
// Each term maps to at least one ontology node's canonical vocabulary.
const SCI_FI_TERMS = [
  // Core genre identifier
  'sci fi',
  'science fiction',
  // proto-science-fiction
  'futurism',
  'automaton',
  'mad scientist',
  // atomic-age-science-fiction
  'atomic',
  'radiation',
  'nuclear',
  // cold-war-paranoia
  'cold war',
  'infiltration',
  'conformity',
  // space-race-cinema
  'space',
  'astronaut',
  'orbital',
  // new-hollywood-science-fiction
  'dystopia',
  'dystopian',
  'state control',
  // philosophical-science-fiction
  'consciousness',
  'identity',
  // blockbuster-science-fiction / general
  'alien',
  'robot',
  'android',
  // cyberpunk
  'cyberpunk',
  'hacker',
  'virtual',
  // ai-cinema
  'artificial intelligence',
  'sentient',
  // alien-encounter
  'extraterrestrial',
  'first contact',
  // time-travel
  'time travel',
  'timeline',
  'paradox',
  // modern-speculative
  'future',
  'near future',
  'post apocalyptic',
  'multiverse',
];

// Franchise filter targets franchises where sci-fi is incidental to IP, not the
// primary creative purpose. Star Wars is intentionally omitted — it is a direct
// curriculum candidate for blockbuster-science-fiction.
const FRANCHISE_PATTERNS = [
  'avengers',
  'justice league',
  'transformers',
  'fast and furious',
  'fast furious',
  'mission impossible',
  'godzilla vs',
  'kong vs',
];

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasSciFiTerm(candidate: ScoredCandidate): boolean {
  const text = normalize([
    candidate.title,
    candidate.overview ?? '',
    ...(candidate.discoveryReasons ?? []),
  ].join(' '));
  return SCI_FI_TERMS.some((term) => text.includes(normalize(term)));
}

function isLikelyFranchise(candidate: ScoredCandidate): boolean {
  const title = normalize(candidate.title);
  return FRANCHISE_PATTERNS.some((term) => title.includes(normalize(term)));
}

function combinedStrength(candidate: ScoredCandidate): number {
  const score = candidate.sciFiScore ?? 0;
  const discovery = (candidate.discoveryScore ?? 0) / 25;
  const votes = Math.min(1, Math.log10(Math.max(1, candidate.voteCount ?? 1)) / 5);
  const rating = Math.max(0, Math.min(1, (candidate.voteAverage ?? 0) / 10));
  return Number((score * 0.55 + discovery * 0.2 + votes * 0.15 + rating * 0.1).toFixed(6));
}

function reasonPass(
  candidate: ScoredCandidate,
  minSciFiScoreWithGenre: number,
  minSciFiScoreWithoutGenre: number,
  allowNoGenre878: boolean,
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const hasGenre878 = Array.isArray(candidate.genreIds) && candidate.genreIds.includes(SCI_FI_GENRE_ID);
  const hasKeywordSignal = hasSciFiTerm(candidate);
  const sciFiScore = candidate.sciFiScore ?? 0;
  const voteCount = candidate.voteCount ?? 0;

  if (hasGenre878) reasons.push('genre:878');
  if (hasKeywordSignal) reasons.push('keyword-signal');
  if (sciFiScore >= minSciFiScoreWithGenre) reasons.push(`score>=${minSciFiScoreWithGenre.toFixed(2)}`);
  if (!hasGenre878 && sciFiScore >= minSciFiScoreWithoutGenre) reasons.push(`score-no-genre>=${minSciFiScoreWithoutGenre.toFixed(2)}`);
  if (voteCount >= 50) reasons.push('votes>=50');

  const passesCore = hasGenre878
    ? sciFiScore >= minSciFiScoreWithGenre
    : (hasKeywordSignal && sciFiScore >= minSciFiScoreWithoutGenre);

  return {
    pass: passesCore && (allowNoGenre878 || hasGenre878),
    reasons,
  };
}

async function main(): Promise<void> {
  const targetCount = parseIntEnv('SEASON3_CALIBRATED_TARGET', 900);
  const minSciFiScoreWithGenre = parseFloatEnv('SEASON3_MIN_SCORE_WITH_GENRE', 0.03);
  const minSciFiScoreWithoutGenre = parseFloatEnv('SEASON3_MIN_SCORE_NO_GENRE', 0.20);
  const fallbackMinSciFiScoreWithGenre = parseFloatEnv('SEASON3_FALLBACK_MIN_SCORE_WITH_GENRE', 0.01);
  const perNodeFloor = parseIntEnv('SEASON3_PER_NODE_CANDIDATE_FLOOR', 100);
  const allowNoGenre878 = process.env.SEASON3_ALLOW_NO_GENRE_878 === 'true';
  const allowFranchise = process.env.SEASON3_ALLOW_FRANCHISE === 'true';

  const payload = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8')) as ScoredFile;
  const candidates = payload.candidates ?? [];

  const accepted: Array<ScoredCandidate & { strength: number; calibrationReasons: string[] }> = [];
  const rejected: Array<{ tmdbId: number; title: string; year: number | null; reason: string }> = [];

  for (const candidate of candidates) {
    const gate = reasonPass(candidate, minSciFiScoreWithGenre, minSciFiScoreWithoutGenre, allowNoGenre878);
    if (!gate.pass) {
      rejected.push({ tmdbId: candidate.tmdbId, title: candidate.title, year: candidate.year, reason: 'gate-fail' });
      continue;
    }
    if (!allowFranchise && isLikelyFranchise(candidate)) {
      rejected.push({ tmdbId: candidate.tmdbId, title: candidate.title, year: candidate.year, reason: 'franchise-filter' });
      continue;
    }
    accepted.push({
      ...candidate,
      strength: combinedStrength(candidate),
      calibrationReasons: gate.reasons,
    });
  }

  const acceptedByTmdb = new Set(accepted.map((item) => item.tmdbId));
  const fallbackTopUp = candidates
    .filter((candidate) => {
      if (acceptedByTmdb.has(candidate.tmdbId)) return false;
      const hasGenre878 = Array.isArray(candidate.genreIds) && candidate.genreIds.includes(SCI_FI_GENRE_ID);
      if (!hasGenre878) return false;
      if ((candidate.sciFiScore ?? 0) < fallbackMinSciFiScoreWithGenre) return false;
      if (!allowFranchise && isLikelyFranchise(candidate)) return false;
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      strength: combinedStrength(candidate),
      calibrationReasons: ['fallback:genre878-topup'],
    }))
    .sort((a, b) => b.strength - a.strength || b.sciFiScore - a.sciFiScore || a.title.localeCompare(b.title));

  const sortedPool = [...accepted, ...fallbackTopUp]
    .sort((a, b) => b.strength - a.strength || b.sciFiScore - a.sciFiScore || a.title.localeCompare(b.title));

  // Priority 8: Deduplicate franchise sequels before balanced selection.
  // This trims valuable franchises (Back to the Future, Star Wars, Alien, etc.)
  // to their maxFromGroup best entries, preventing a single franchise from
  // consuming multiple curriculum slots. The pool is sorted by strength first
  // so the best entry from each franchise is always the one that survives.
  const { kept: pool, removed: franchiseRemoved } = deduplicateFranchiseSequels(sortedPool);
  rejected.push(
    ...franchiseRemoved.map((r) => ({ tmdbId: r.tmdbId, title: r.title, year: null, reason: r.reason })),
  );

  const calibrated = selectBalancedCandidates(pool, {
    targetCount,
    perNodeFloor,
    nodeSlugs: SEASON3_SCI_FI_NODE_SLUGS,
  }) as Array<ScoredCandidate & { strength: number; calibrationReasons: string[] }>;

  const stats = {
    generatedAt: new Date().toISOString(),
    inputCount: candidates.length,
    acceptedBeforeLimit: accepted.length,
    finalCount: calibrated.length,
    targetCount,
    rejectedCount: rejected.length,
    withGenre878: calibrated.filter((item) => Array.isArray(item.genreIds) && item.genreIds.includes(SCI_FI_GENRE_ID)).length,
    withoutGenre878: calibrated.filter((item) => !(Array.isArray(item.genreIds) && item.genreIds.includes(SCI_FI_GENRE_ID))).length,
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify({
    ...stats,
    candidates: calibrated,
    rejectedSample: rejected.slice(0, 200),
  }, null, 2)}\n`, 'utf8');

  const lines: string[] = [];
  lines.push('# Season 3 Sci-Fi Candidate Calibration');
  lines.push('');
  lines.push(`Generated: ${stats.generatedAt}`);
  lines.push(`Input: ${stats.inputCount}`);
  lines.push(`Accepted before cap: ${stats.acceptedBeforeLimit}`);
  lines.push(`Final count: ${stats.finalCount} (target=${stats.targetCount})`);
  lines.push(`Rejected: ${stats.rejectedCount}`);
  lines.push(`Per-node floor target: ${perNodeFloor}`);
  lines.push(`With sci-fi genre 878: ${stats.withGenre878}`);
  lines.push(`Without sci-fi genre 878: ${stats.withoutGenre878}`);
  lines.push('');
  lines.push('## Top 25');
  lines.push('');
  lines.push('| Title | Year | Strength | SciFiScore | Top Node |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const row of calibrated.slice(0, 25)) {
    lines.push(`| ${row.title.replace(/\|/g, '\\|')} | ${row.year ?? 'n/a'} | ${row.strength.toFixed(3)} | ${(row.sciFiScore ?? 0).toFixed(3)} | ${row.topNodes?.[0]?.nodeSlug ?? 'n/a'} |`);
  }
  lines.push('');

  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  console.log(`[calibrate-season3-sci-fi] wrote ${OUTPUT_PATH}`);
  console.log(`[calibrate-season3-sci-fi] wrote ${REPORT_PATH}`);
  console.log(`[calibrate-season3-sci-fi] final=${stats.finalCount} with878=${stats.withGenre878} without878=${stats.withoutGenre878}`);
}

void main().catch((error) => {
  console.error('[calibrate-season3-sci-fi] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
