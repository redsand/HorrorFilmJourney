import { PrismaClient } from '@prisma/client';

type TmdbDiscoverMovie = {
  id?: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  popularity?: number;
};

type TmdbDiscoverResponse = {
  results?: TmdbDiscoverMovie[];
  total_pages?: number;
};

type SyncCounters = {
  processed: number;
  withPoster: number;
  upserted: number;
  partitions: number;
  truncatedPartitions: number;
};

const GENRE_NAME_BY_ID: Record<number, string> = {
  27: 'horror',
  53: 'thriller',
  9648: 'mystery',
  14: 'fantasy',
  878: 'sci-fi',
  80: 'crime',
  18: 'drama',
  35: 'comedy',
  12: 'adventure',
  16: 'animation',
};

const DEFAULT_GENRE_FILTER = '27|53|9648';
const DEFAULT_SORT = 'popularity.desc';
const DEFAULT_PAGE_LIMIT = 500;
const FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_WINDOW_YEARS = 5;

function parseIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolveRequestedPages(): number {
  const raw = (process.env.TMDB_FULL_SYNC_PAGES ?? '').trim().toLowerCase();
  if (raw === 'all') {
    return 500;
  }
  return Math.min(parseIntEnv('TMDB_FULL_SYNC_PAGES', DEFAULT_PAGE_LIMIT), 500);
}

function resolveYearStart(): number {
  return parseIntEnv('TMDB_FULL_SYNC_YEAR_START', 1920);
}

function resolveYearEnd(): number {
  return parseIntEnv('TMDB_FULL_SYNC_YEAR_END', new Date().getUTCFullYear());
}

function resolveWindowYears(): number {
  return parseIntEnv('TMDB_FULL_SYNC_WINDOW_YEARS', DEFAULT_WINDOW_YEARS);
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return raw === 'true';
}

function toYear(releaseDate?: string): number | undefined {
  if (!releaseDate || releaseDate.length < 4) {
    return undefined;
  }
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isInteger(year) ? year : undefined;
}

function imdbApprox(voteAverage?: number): { value: number; rawValue: string } {
  const numeric = typeof voteAverage === 'number' && Number.isFinite(voteAverage) ? voteAverage : 6.5;
  const clamped = Math.max(1, Math.min(10, numeric));
  return { value: Number(clamped.toFixed(1)), rawValue: `${clamped.toFixed(1)}/10` };
}

function tmdbPopularityScore(popularity?: number): { value: number; rawValue: string } {
  const numeric = typeof popularity === 'number' && Number.isFinite(popularity) ? popularity : 25;
  const normalized = Math.max(1, Math.min(100, Math.round(numeric)));
  return { value: normalized, rawValue: `${normalized}/100` };
}

function toGenres(genreIds?: number[]): string[] {
  if (!Array.isArray(genreIds) || genreIds.length === 0) {
    return ['horror'];
  }
  const mapped = genreIds
    .map((id) => GENRE_NAME_BY_ID[id])
    .filter((value): value is string => typeof value === 'string');
  const derived = new Set(mapped.length > 0 ? mapped : ['horror']);
  if (genreIds.includes(878)) {
    derived.add('sci-fi-horror');
  }
  return [...derived];
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

async function fetchDiscoverPage(apiKey: string, page: number, startYear: number, endYear: number): Promise<TmdbDiscoverResponse> {
  const url = new URL('https://api.themoviedb.org/3/discover/movie');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('with_genres', process.env.TMDB_FULL_SYNC_GENRES ?? DEFAULT_GENRE_FILTER);
  url.searchParams.set('sort_by', process.env.TMDB_FULL_SYNC_SORT ?? DEFAULT_SORT);
  url.searchParams.set('language', process.env.TMDB_FULL_SYNC_LANGUAGE ?? 'en-US');
  url.searchParams.set('region', process.env.TMDB_FULL_SYNC_REGION ?? 'US');
  url.searchParams.set('include_adult', String(parseBoolEnv('TMDB_FULL_SYNC_INCLUDE_ADULT', false)));
  url.searchParams.set('include_video', 'false');
  url.searchParams.set('vote_count.gte', String(parseIntEnv('TMDB_FULL_SYNC_MIN_VOTE_COUNT', 50)));
  url.searchParams.set('primary_release_date.gte', `${startYear}-01-01`);
  url.searchParams.set('primary_release_date.lte', `${endYear}-12-31`);
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`TMDB discover failed on page ${page} with status ${response.status}`);
  }
  return await response.json() as TmdbDiscoverResponse;
}

async function upsertMovie(
  prisma: PrismaClient,
  movie: TmdbDiscoverMovie,
  seenTmdbIds: Set<number>,
  counters: SyncCounters,
): Promise<void> {
  const tmdbId = movie.id;
  const title = movie.title?.trim();
  const posterPath = movie.poster_path?.trim();
  if (!tmdbId || !title || seenTmdbIds.has(tmdbId)) {
    return;
  }
  seenTmdbIds.add(tmdbId);
  counters.processed += 1;

  if (!posterPath) {
    return;
  }
  counters.withPoster += 1;

  const posterUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;
  const existing = await prisma.movie.findUnique({
    where: { tmdbId },
    select: { genres: true },
  });
  const existingGenres = parseJsonStringArray(existing?.genres);
  const mergedGenres = [...new Set([...existingGenres, ...toGenres(movie.genre_ids)])];
  const persisted = await prisma.movie.upsert({
    where: { tmdbId },
    create: {
      tmdbId,
      title,
      year: toYear(movie.release_date),
      posterUrl,
      posterLastValidatedAt: new Date(),
      genres: mergedGenres,
    },
    update: {
      title,
      year: toYear(movie.release_date),
      posterUrl,
      posterLastValidatedAt: new Date(),
      genres: mergedGenres,
    },
    select: { id: true },
  });
  counters.upserted += 1;

  const imdb = imdbApprox(movie.vote_average);
  const tmdb = imdbApprox(movie.vote_average);
  const popularity = tmdbPopularityScore(movie.popularity);

  await prisma.movieRating.upsert({
    where: { movieId_source: { movieId: persisted.id, source: 'IMDB' } },
    create: { movieId: persisted.id, source: 'IMDB', value: imdb.value, scale: '10', rawValue: imdb.rawValue },
    update: { value: imdb.value, scale: '10', rawValue: imdb.rawValue },
  });
  await prisma.movieRating.upsert({
    where: { movieId_source: { movieId: persisted.id, source: 'TMDB' } },
    create: { movieId: persisted.id, source: 'TMDB', value: tmdb.value, scale: '10', rawValue: tmdb.rawValue },
    update: { value: tmdb.value, scale: '10', rawValue: tmdb.rawValue },
  });
  await prisma.movieRating.upsert({
    where: { movieId_source: { movieId: persisted.id, source: 'TMDB_POPULARITY' } },
    create: {
      movieId: persisted.id,
      source: 'TMDB_POPULARITY',
      value: popularity.value,
      scale: '100',
      rawValue: popularity.rawValue,
    },
    update: {
      value: popularity.value,
      scale: '100',
      rawValue: popularity.rawValue,
    },
  });
}

async function syncPartition(
  prisma: PrismaClient,
  apiKey: string,
  startYear: number,
  endYear: number,
  pageLimit: number,
  seenTmdbIds: Set<number>,
  counters: SyncCounters,
): Promise<void> {
  counters.partitions += 1;
  const partitionStartedAt = Date.now();
  const page1 = await fetchDiscoverPage(apiKey, 1, startYear, endYear);
  const totalPages = Number.isInteger(page1.total_pages) ? page1.total_pages as number : 1;
  const effectivePages = Math.min(totalPages, pageLimit, 500);

  if (totalPages > pageLimit && startYear < endYear) {
    const split = Math.floor((startYear + endYear) / 2);
    console.log(
      `Partition ${startYear}-${endYear} saturated (${totalPages} pages). Splitting into ${startYear}-${split} and ${split + 1}-${endYear}.`,
    );
    await syncPartition(prisma, apiKey, startYear, split, pageLimit, seenTmdbIds, counters);
    await syncPartition(prisma, apiKey, split + 1, endYear, pageLimit, seenTmdbIds, counters);
    return;
  }

  if (totalPages > pageLimit && startYear === endYear) {
    counters.truncatedPartitions += 1;
    console.warn(`Year ${startYear} still saturated at ${totalPages} pages; capped to ${pageLimit} pages.`);
  }

  const page1Results = Array.isArray(page1.results) ? page1.results : [];
  for (const movie of page1Results) {
    // eslint-disable-next-line no-await-in-loop
    await upsertMovie(prisma, movie, seenTmdbIds, counters);
  }

  for (let page = 2; page <= effectivePages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const payload = await fetchDiscoverPage(apiKey, page, startYear, endYear);
    const results = Array.isArray(payload.results) ? payload.results : [];
    // eslint-disable-next-line no-restricted-syntax
    for (const movie of results) {
      // eslint-disable-next-line no-await-in-loop
      await upsertMovie(prisma, movie, seenTmdbIds, counters);
    }
  }

  console.log(
    `Partition ${startYear}-${endYear} synced pages=${effectivePages}/${Math.min(totalPages, 500)} in ${Date.now() - partitionStartedAt}ms`,
  );
}

async function main(): Promise<void> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is required for sync-tmdb-catalog');
  }

  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST;
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();

  const pageLimit = resolveRequestedPages();
  const yearStart = resolveYearStart();
  const yearEnd = resolveYearEnd();
  const windowYears = resolveWindowYears();
  const seenTmdbIds = new Set<number>();
  const counters: SyncCounters = {
    processed: 0,
    withPoster: 0,
    upserted: 0,
    partitions: 0,
    truncatedPartitions: 0,
  };

  try {
    console.log(
      `TMDB catalog sync started (pagesCap=${pageLimit}, years=${yearStart}-${yearEnd}, windowYears=${windowYears}, genres=${process.env.TMDB_FULL_SYNC_GENRES ?? DEFAULT_GENRE_FILTER})`,
    );

    if (yearEnd < yearStart) {
      throw new Error(`Invalid year range: start=${yearStart}, end=${yearEnd}`);
    }

    for (let startYear = yearStart; startYear <= yearEnd; startYear += windowYears) {
      const endYear = Math.min(startYear + windowYears - 1, yearEnd);
      // eslint-disable-next-line no-await-in-loop
      await syncPartition(prisma, apiKey, startYear, endYear, pageLimit, seenTmdbIds, counters);
    }

    const movieCount = await prisma.movie.count();
    const ratingCount = await prisma.movieRating.count();
    console.log(
      `TMDB catalog sync complete: processed=${counters.processed} withPoster=${counters.withPoster} upserted=${counters.upserted} partitions=${counters.partitions} truncatedPartitions=${counters.truncatedPartitions} dbMovies=${movieCount} dbRatings=${ratingCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('TMDB catalog sync failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
