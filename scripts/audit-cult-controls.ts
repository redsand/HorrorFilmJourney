import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type ControlItem = { label: string; tmdbId: number; expected: 'cult' | 'non-cult' };

const DEFAULT_CONTROLS: ControlItem[] = [
  { label: 'The Big Lebowski', tmdbId: 115, expected: 'cult' },
  { label: 'Pulp Fiction', tmdbId: 680, expected: 'cult' },
  { label: 'Scarface', tmdbId: 111, expected: 'cult' },
  { label: 'Donnie Darko', tmdbId: 141, expected: 'cult' },
  { label: 'Toy Story', tmdbId: 862, expected: 'non-cult' },
  { label: 'The Avengers', tmdbId: 24428, expected: 'non-cult' },
  { label: 'Interstellar', tmdbId: 157336, expected: 'non-cult' },
];

const CULT_KEYWORD_HINTS = [
  'cult',
  'midnight movie',
  'grindhouse',
  'exploitation',
  'b movie',
  'camp',
  'outsider',
  'underground',
  'video nasty',
  'transgressive',
];
const FRANCHISE_KEYWORDS = [
  'avengers',
  'star wars',
  'batman',
  'superman',
  'spider-man',
  'jurassic',
  'mission impossible',
  'fast and furious',
  'transformers',
  'harry potter',
  'lord of the rings',
  'frozen',
  'toy story',
  'shrek',
  'cars',
  'despicable me',
  'minions',
];

function score(input: {
  voteCount: number | null;
  voteAverage: number | null;
  popularity: number | null;
  releaseYear: number | null;
  genreIds: number[];
  keywordNames: string[];
}): number {
  let value = 0;
  const hasCultKeyword = input.keywordNames.some((keyword) =>
    CULT_KEYWORD_HINTS.some((hint) => keyword.includes(hint)),
  );
  const hasFranchiseKeyword = FRANCHISE_KEYWORDS.some((franchise) =>
    input.keywordNames.some((keyword) => keyword.includes(franchise)),
  );
  const hasAnimationGenre = input.genreIds.includes(16);
  const likelyMainstreamBlockbuster =
    (input.voteCount ?? 0) >= 15000
    && (input.popularity ?? 0) >= 40
    && (input.releaseYear ?? 0) >= 1980;

  if ((input.voteCount ?? 0) >= 1000) value += 1;
  if ((input.voteAverage ?? 0) >= 6.0) value += 1;
  if ((input.popularity ?? 0) >= 5 && (input.popularity ?? 0) <= 120) value += 1;
  if ((input.releaseYear ?? 3000) <= 2015) value += 1;
  const cultGenreIds = new Set([27, 53, 878, 14, 35, 28, 80, 9648, 10402]);
  if (input.genreIds.some((id) => cultGenreIds.has(id))) value += 1;
  if (hasCultKeyword) value += 1;
  if (hasAnimationGenre) value -= 3;
  if (hasFranchiseKeyword) value -= 2;
  if (likelyMainstreamBlockbuster && !hasCultKeyword) value -= 2;
  return value;
}

async function fetchMovieFacts(apiKey: string, tmdbId: number): Promise<{
  title: string;
  voteCount: number | null;
  voteAverage: number | null;
  popularity: number | null;
  releaseYear: number | null;
  genreIds: number[];
  keywordNames: string[];
} | null> {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('append_to_response', 'keywords');
  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    title?: string;
    vote_count?: number;
    vote_average?: number;
    popularity?: number;
    release_date?: string;
    genres?: Array<{ id?: number }>;
    keywords?: { keywords?: Array<{ name?: string }> } | Array<{ name?: string }>;
  };
  const releaseYear = typeof payload.release_date === 'string' && payload.release_date.length >= 4
    ? Number.parseInt(payload.release_date.slice(0, 4), 10)
    : null;
  const keywordNames = Array.isArray((payload.keywords as { keywords?: Array<{ name?: string }> })?.keywords)
    ? (((payload.keywords as { keywords?: Array<{ name?: string }> }).keywords) ?? [])
      .map((item) => item.name?.trim().toLowerCase() ?? '')
      .filter((value) => value.length > 0)
    : Array.isArray(payload.keywords)
      ? (payload.keywords as Array<{ name?: string }>)
        .map((item) => item.name?.trim().toLowerCase() ?? '')
        .filter((value) => value.length > 0)
      : [];

  return {
    title: payload.title ?? `TMDB ${tmdbId}`,
    voteCount: typeof payload.vote_count === 'number' ? payload.vote_count : null,
    voteAverage: typeof payload.vote_average === 'number' ? payload.vote_average : null,
    popularity: typeof payload.popularity === 'number' ? payload.popularity : null,
    releaseYear: Number.isInteger(releaseYear) ? releaseYear : null,
    genreIds: (payload.genres ?? []).map((entry) => Number(entry.id)).filter((id) => Number.isInteger(id)),
    keywordNames,
  };
}

async function main(): Promise<void> {
  const envRaw = await readFile(resolve('.env.production'), 'utf8');
  const apiKeyLine = envRaw.split(/\r?\n/).find((line) => line.startsWith('TMDB_API_KEY='));
  const apiKey = apiKeyLine?.split('=')[1]?.replace(/^"|"$/g, '');
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is missing in .env.production');
  }

  const threshold = Number.parseInt(process.env.SEASON2_CULT_SCORE_MIN ?? '4', 10);
  let correct = 0;
  for (const control of DEFAULT_CONTROLS) {
    const facts = await fetchMovieFacts(apiKey, control.tmdbId);
    if (!facts) {
      console.log(`${control.label} (${control.tmdbId}) -> fetch failed`);
      continue;
    }
    const s = score({
      voteCount: facts.voteCount,
      voteAverage: facts.voteAverage,
      popularity: facts.popularity,
      releaseYear: facts.releaseYear,
      genreIds: facts.genreIds,
      keywordNames: facts.keywordNames,
    });
    const predicted = s >= threshold ? 'cult' : 'non-cult';
    if (predicted === control.expected) correct += 1;
    console.log(
      `${facts.title} (${control.tmdbId}) expected=${control.expected} predicted=${predicted} score=${s} keywords=${facts.keywordNames.length}`,
    );
  }
  const accuracy = Math.round((correct / DEFAULT_CONTROLS.length) * 10000) / 100;
  console.log(`Control accuracy: ${correct}/${DEFAULT_CONTROLS.length} (${accuracy}%)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
