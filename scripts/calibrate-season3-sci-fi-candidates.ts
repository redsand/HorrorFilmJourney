import fs from 'node:fs/promises';
import path from 'node:path';

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
const SCI_FI_TERMS = [
  'sci fi',
  'science fiction',
  'space',
  'alien',
  'robot',
  'android',
  'cyberpunk',
  'dystopian',
  'time travel',
  'future',
  'multiverse',
  'post apocalyptic',
];

const FRANCHISE_PATTERNS = [
  'avengers',
  'justice league',
  'star wars',
  'transformers',
  'fast and furious',
  'mission impossible',
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

function reasonPass(candidate: ScoredCandidate, minSciFiScoreWithGenre: number, minSciFiScoreWithoutGenre: number): { pass: boolean; reasons: string[] } {
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
    pass: passesCore,
    reasons,
  };
}

async function main(): Promise<void> {
  const targetCount = parseIntEnv('SEASON3_CALIBRATED_TARGET', 900);
  const minSciFiScoreWithGenre = parseFloatEnv('SEASON3_MIN_SCORE_WITH_GENRE', 0.08);
  const minSciFiScoreWithoutGenre = parseFloatEnv('SEASON3_MIN_SCORE_NO_GENRE', 0.20);
  const allowFranchise = process.env.SEASON3_ALLOW_FRANCHISE === 'true';

  const payload = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8')) as ScoredFile;
  const candidates = payload.candidates ?? [];

  const accepted: Array<ScoredCandidate & { strength: number; calibrationReasons: string[] }> = [];
  const rejected: Array<{ tmdbId: number; title: string; year: number | null; reason: string }> = [];

  for (const candidate of candidates) {
    const gate = reasonPass(candidate, minSciFiScoreWithGenre, minSciFiScoreWithoutGenre);
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

  const calibrated = accepted
    .sort((a, b) => b.strength - a.strength || b.sciFiScore - a.sciFiScore || a.title.localeCompare(b.title))
    .slice(0, targetCount);

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

