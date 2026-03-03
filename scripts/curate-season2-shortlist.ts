import { readFileSync, writeFileSync } from 'node:fs';

type Candidate = {
  tmdbId: number;
  title: string;
  year: number | null;
  genres: string[];
  tmdbRating: number | null;
  tmdbPopularity: number | null;
  bucket: 'keep' | 'review' | 'reject';
  reasons: string[];
};

type TitleListEntry = {
  title: string;
  year?: number;
  reason?: string;
};

const SOURCE_PATH = 'docs/season/season-2-cult-candidates-shortlist.json';
const CURATED_PATH = 'docs/season/season-2-cult-candidates-curated.json';
const BLOCKLIST_PATH = 'docs/season/season-2-cult-classics-blocklist.json';
const ALLOWLIST_PATH = 'docs/season/season-2-cult-classics-allowlist.json';

const MAINSTREAM_FRANCHISE_KEYWORDS = [
  'avengers',
  'captain america',
  'captain marvel',
  'justice league',
  'batman',
  'superman',
  'spider-man',
  'star wars',
  'harry potter',
  'transformers',
  'fast and furious',
  'mission impossible',
  'pirates of the caribbean',
  'avatar',
  'toy story',
  'zootopia',
  'inside out',
  'shrek',
  'kung fu panda',
  'frozen',
  'despicable me',
  'minions',
  'moana',
  'how to train your dragon',
  'demon slayer',
  'chainsaw man',
  'interstellar',
];

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asGenreList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);
}

function classifyReject(candidate: Candidate): { reject: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const title = candidate.title.toLowerCase();
  const genres = asGenreList(candidate.genres);

  if ((candidate.year ?? 9999) > 2010) {
    reasons.push('post-2010-excluded-for-season-2');
  }
  if (genres.includes('animation')) {
    reasons.push('animation-excluded-for-season-2-cult');
  }
  if (MAINSTREAM_FRANCHISE_KEYWORDS.some((keyword) => title.includes(keyword))) {
    reasons.push('mainstream-franchise-keyword');
  }
  if (candidate.tmdbPopularity !== null && candidate.tmdbPopularity > 90 && !title.includes('cult')) {
    reasons.push('extreme-mainstream-popularity');
  }

  return { reject: reasons.length > 0, reasons };
}

function main(): void {
  const payload = JSON.parse(readFileSync(SOURCE_PATH, 'utf8')) as {
    generatedAt: string;
    total: number;
    candidates: Candidate[];
  };

  const seen = new Set<string>();
  const blocklistEntries: TitleListEntry[] = [];
  const curatedCandidates: Candidate[] = [];
  const rejected: Array<Candidate & { rejectReasons: string[] }> = [];

  for (const candidate of payload.candidates) {
    const key = `${normalizeTitle(candidate.title)}:${candidate.year ?? 'na'}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const classified = classifyReject(candidate);
    if (classified.reject) {
      rejected.push({ ...candidate, rejectReasons: classified.reasons });
      blocklistEntries.push({
        title: candidate.title,
        ...(candidate.year ? { year: candidate.year } : {}),
        reason: classified.reasons.join(','),
      });
      continue;
    }
    curatedCandidates.push(candidate);
  }

  const allowlistEntries: TitleListEntry[] = [
    { title: 'The Big Lebowski', year: 1998, reason: 'user-required-cult-anchor' },
    { title: 'Scarface', year: 1983, reason: 'user-required-cult-anchor' },
    { title: 'Pulp Fiction', year: 1994, reason: 'user-required-cult-anchor' },
  ];

  const curatedPayload = {
    generatedAt: new Date().toISOString(),
    sourcePath: SOURCE_PATH,
    inputTotal: payload.total,
    curatedTotal: curatedCandidates.length,
    rejectedTotal: rejected.length,
    curatedCandidates,
    rejected: rejected.map((entry) => ({
      tmdbId: entry.tmdbId,
      title: entry.title,
      year: entry.year,
      reasons: entry.rejectReasons,
    })),
  };

  writeFileSync(CURATED_PATH, `${JSON.stringify(curatedPayload, null, 2)}\n`, 'utf8');
  writeFileSync(BLOCKLIST_PATH, `${JSON.stringify({ entries: blocklistEntries }, null, 2)}\n`, 'utf8');
  writeFileSync(ALLOWLIST_PATH, `${JSON.stringify({ entries: allowlistEntries }, null, 2)}\n`, 'utf8');

  console.log(
    `[season2.curate] curated=${curatedCandidates.length} rejected=${rejected.length} blocklist=${blocklistEntries.length}`,
  );
  console.log(`[season2.curate] wrote ${CURATED_PATH}`);
  console.log(`[season2.curate] wrote ${BLOCKLIST_PATH}`);
  console.log(`[season2.curate] wrote ${ALLOWLIST_PATH}`);
}

main();
