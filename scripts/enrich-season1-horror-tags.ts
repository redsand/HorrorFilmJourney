import { PrismaClient } from '@prisma/client';

type KeywordResponse = {
  keywords?: Array<{ id?: number; name?: string }>;
};

type TagRule = {
  tag: string;
  patterns: RegExp[];
};

const FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_MOVIES = 3000;

const TAG_RULES: TagRule[] = [
  { tag: 'supernatural-horror', patterns: [/\bghost\b/i, /\bhaunt/i, /\bparanormal\b/i, /\bpossession\b/i, /\bdemon/i, /\bexorc/i, /\bcurse/i] },
  { tag: 'psychological-horror', patterns: [/\bpsychological\b/i, /\bparanoia\b/i, /\bmadness\b/i, /\bdream\b/i, /\bsurreal\b/i] },
  { tag: 'slasher-serial-killer', patterns: [/\bslasher\b/i, /\bserial killer\b/i, /\bstalker\b/i, /\bmasked killer\b/i, /\bhome invasion\b/i] },
  { tag: 'creature-monster', patterns: [/\bmonster\b/i, /\bcreature\b/i, /\bwerewolf\b/i, /\bvampire\b/i, /\bshark\b/i, /\bkaiju\b/i, /\bcryptid\b/i] },
  { tag: 'body-horror', patterns: [/\bbody horror\b/i, /\bmutation\b/i, /\binfection\b/i, /\bparasite\b/i, /\bmetamorphosis\b/i, /\bdisease\b/i] },
  { tag: 'cosmic-horror', patterns: [/\bcosmic\b/i, /\beldritch\b/i, /\blovecraft\b/i, /\bancient god/i, /\bforbidden knowledge\b/i] },
  { tag: 'folk-horror', patterns: [/\bfolk horror\b/i, /\bpagan\b/i, /\britual\b/i, /\bcult ritual\b/i, /\bvillage\b/i] },
  { tag: 'sci-fi-horror', patterns: [/\bsci[\s-]?fi\b/i, /\balien\b/i, /\bspace horror\b/i, /\bcybernetic\b/i, /\bgenetic experiment\b/i] },
  { tag: 'found-footage', patterns: [/\bfound footage\b/i, /\bmockumentary\b/i, /\bscreenlife\b/i, /\bsurveillance\b/i, /\banalog horror\b/i] },
  { tag: 'survival-horror', patterns: [/\bsurvival\b/i, /\bsiege\b/i, /\bwilderness\b/i, /\bescape\b/i, /\bisolation\b/i] },
  { tag: 'apocalyptic-horror', patterns: [/\bapocalypse\b/i, /\bpost-apocalyptic\b/i, /\boutbreak\b/i, /\bzombie\b/i, /\bend of the world\b/i] },
  { tag: 'gothic-horror', patterns: [/\bgothic\b/i, /\bvictorian\b/i, /\bcastle\b/i, /\bhaunted house\b/i] },
  { tag: 'horror-comedy', patterns: [/\bhorror comedy\b/i, /\bparody\b/i, /\bsatire\b/i, /\bdark comedy\b/i, /\bcamp\b/i] },
  { tag: 'splatter-extreme', patterns: [/\bsplatter\b/i, /\bgore\b/i, /\bextreme horror\b/i, /\btransgressive\b/i, /\btorture\b/i] },
  { tag: 'social-domestic-horror', patterns: [/\bsocial horror\b/i, /\bdomestic horror\b/i, /\bfamily trauma\b/i, /\bclass horror\b/i, /\bsuburban horror\b/i] },
  { tag: 'experimental-horror', patterns: [/\bexperimental\b/i, /\bavant[- ]garde\b/i, /\blynchian\b/i, /\bdream logic\b/i] },
];

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

async function fetchTmdbKeywords(apiKey: string, tmdbId: number): Promise<string[]> {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}/keywords?api_key=${apiKey}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    return [];
  }
  const payload = await response.json() as KeywordResponse;
  return (payload.keywords ?? [])
    .map((entry) => entry.name?.trim().toLowerCase())
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function inferTagsFromKeywords(keywords: string[]): string[] {
  if (keywords.length === 0) {
    return [];
  }
  const matched = new Set<string>();
  for (const keyword of keywords) {
    for (const rule of TAG_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(keyword))) {
        matched.add(rule.tag);
      }
    }
  }
  return [...matched];
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const current = items[cursor]!;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      await worker(current);
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is required');
  }
  const prisma = new PrismaClient();
  const maxMovies = parseIntEnv('SEASON1_ENRICH_MAX_MOVIES', DEFAULT_MAX_MOVIES);
  const concurrency = parseIntEnv('SEASON1_ENRICH_CONCURRENCY', DEFAULT_CONCURRENCY);

  try {
    const movies = (await prisma.movie.findMany({
      select: {
        id: true,
        tmdbId: true,
        genres: true,
        ratings: {
          where: { source: 'TMDB_POPULARITY' },
          select: { value: true },
          take: 1,
        },
      },
    }))
      .map((movie) => {
        const genres = parseJsonStringArray(movie.genres);
        return {
          id: movie.id,
          tmdbId: movie.tmdbId,
          genres,
          popularity: movie.ratings[0]?.value ?? 0,
        };
      })
      .filter((movie) => movie.tmdbId > 0 && movie.genres.includes('horror'))
      .sort((a, b) => (b.popularity - a.popularity) || (a.tmdbId - b.tmdbId))
      .slice(0, maxMovies);

    let scanned = 0;
    let updated = 0;
    let failures = 0;
    let totalTagsAdded = 0;

    await runPool(movies, concurrency, async (movie) => {
      scanned += 1;
      try {
        const keywords = await fetchTmdbKeywords(apiKey, movie.tmdbId);
        const inferred = inferTagsFromKeywords(keywords);
        if (inferred.length === 0) {
          return;
        }
        const merged = [...new Set([...movie.genres, ...inferred])];
        if (merged.length === movie.genres.length) {
          return;
        }
        await prisma.movie.update({
          where: { id: movie.id },
          data: { genres: merged },
        });
        updated += 1;
        totalTagsAdded += merged.length - movie.genres.length;
      } catch {
        failures += 1;
      }
    });

    console.log(
      `Season 1 tag enrichment complete: scanned=${scanned} updated=${updated} tagsAdded=${totalTagsAdded} failures=${failures} maxMovies=${maxMovies} concurrency=${concurrency}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 tag enrichment failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
