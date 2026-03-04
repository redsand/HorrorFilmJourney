import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import {
  parseCastTop,
  parseCountry,
  parseDirector,
  parseKeywords,
  toGenreIds,
  toGenreNames,
} from '../src/lib/tmdb/tmdb-normalization.ts';
import { mergeCreditsWithGuard } from '../src/lib/tmdb/credits-guard.ts';

type TmdbMovieDetails = {
  id?: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  genres?: Array<{ id?: number; name?: string }>;
  vote_average?: number;
  popularity?: number;
  overview?: string;
  production_countries?: Array<{ name?: string }>;
  keywords?: { keywords?: Array<{ name?: string }> };
  credits?: {
    cast?: Array<{ name?: string; character?: string }>;
    crew?: Array<{ name?: string; job?: string }>;
  };
};

const DEFAULT_GENRES = [27, 53, 9648, 878, 14, 18, 35, 12]; // broaden horror-adjacent discovery
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_MAX_SCAN_IDS = 5000;
const FETCH_TIMEOUT_MS = 12_000;

function parseIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseGenreFilter(): number[] {
  const raw = process.env.TMDB_UPDATE_GENRE_IDS?.trim();
  if (!raw) {
    return DEFAULT_GENRES;
  }
  const ids = raw
    .split('|')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
  return ids.length > 0 ? ids : DEFAULT_GENRES;
}

function parseReleaseDate(value?: string): Date | null {
  if (!value || value.trim().length === 0) {
    return null;
  }
  const normalized = `${value.trim()}T00:00:00.000Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function resolveReleaseDateCutoff(): Promise<string | null> {
  const explicit = process.env.TMDB_UPDATE_RELEASE_DATE_GTE?.trim();
  if (explicit) {
    if (!parseReleaseDate(explicit)) {
      throw new Error('TMDB_UPDATE_RELEASE_DATE_GTE must be YYYY-MM-DD');
    }
    return explicit;
  }

  const backupPath = process.env.TMDB_UPDATE_FROM_BACKUP?.trim();
  if (!backupPath) {
    return null;
  }
  const raw = await readFile(backupPath, 'utf8');
  const parsed = JSON.parse(raw) as { summary?: { latestReleaseDate?: string | null } };
  const fromBackup = parsed?.summary?.latestReleaseDate ?? null;
  if (!fromBackup) {
    return null;
  }
  if (!parseReleaseDate(fromBackup)) {
    throw new Error('TMDB_UPDATE_FROM_BACKUP summary.latestReleaseDate is invalid');
  }
  return fromBackup;
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

function toGenres(genreIds: number[]): string[] {
  return toGenreNames(genreIds);
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

function matchesGenreFilter(movie: TmdbMovieDetails, allowGenreIds: number[]): boolean {
  const genreIds = toGenreIds(movie);
  return genreIds.some((id) => allowGenreIds.includes(id));
}

async function fetchLatestTmdbId(apiKey: string): Promise<number> {
  const response = await fetch(`https://api.themoviedb.org/3/movie/latest?api_key=${apiKey}`, {
    method: 'GET',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`TMDB latest endpoint failed with status ${response.status}`);
  }
  const payload = await response.json() as { id?: number };
  if (!payload.id || !Number.isInteger(payload.id)) {
    throw new Error('TMDB latest endpoint returned invalid id');
  }
  return payload.id;
}

async function fetchMovieDetails(apiKey: string, tmdbId: number): Promise<TmdbMovieDetails | null> {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=en-US&append_to_response=keywords,credits`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return await response.json() as TmdbMovieDetails;
  } catch {
    return null;
  }
}

async function runPool<T>(
  items: number[],
  worker: (item: number) => Promise<T>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const current = items[cursor]!;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      results.push(await worker(current));
    }
  });

  await Promise.all(runners);
  return results;
}

async function main(): Promise<void> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is required for sync-tmdb-catalog-update');
  }

  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST;
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();

  const allowGenreIds = parseGenreFilter();
  const maxScanIds = parseIntEnv('TMDB_UPDATE_MAX_SCAN_IDS', DEFAULT_MAX_SCAN_IDS);
  const concurrency = parseIntEnv('TMDB_UPDATE_CONCURRENCY', DEFAULT_CONCURRENCY);
  const releaseDateCutoff = await resolveReleaseDateCutoff();
  const cutoffDate = parseReleaseDate(releaseDateCutoff ?? undefined);

  try {
    const aggregate = await prisma.movie.aggregate({ _max: { tmdbId: true } });
    const localMaxId = aggregate._max.tmdbId ?? 0;
    const remoteLatestId = await fetchLatestTmdbId(apiKey);

    if (remoteLatestId <= localMaxId) {
      console.log(`TMDB update: no newer ids (localMax=${localMaxId}, remoteLatest=${remoteLatestId})`);
      return;
    }

    const startId = localMaxId + 1;
    const endId = Math.min(remoteLatestId, startId + maxScanIds - 1);
    const scanIds: number[] = [];
    for (let id = startId; id <= endId; id += 1) {
      scanIds.push(id);
    }

    console.log(
      `TMDB incremental update started: scanRange=${startId}-${endId} count=${scanIds.length} concurrency=${concurrency} genres=${allowGenreIds.join('|')} releaseDateGte=${releaseDateCutoff ?? 'none'}`,
    );

    let fetched = 0;
    let matched = 0;
    let withPoster = 0;
    let upserted = 0;

    await runPool(
      scanIds,
      async (tmdbId) => {
        const movie = await fetchMovieDetails(apiKey, tmdbId);
        fetched += 1;
        if (!movie?.id || !movie.title || !matchesGenreFilter(movie, allowGenreIds)) {
          return;
        }
        if (cutoffDate) {
          const movieReleaseDate = parseReleaseDate(movie.release_date);
          if (!movieReleaseDate || movieReleaseDate < cutoffDate) {
            return;
          }
        }
        matched += 1;

        const posterPath = movie.poster_path?.trim();
        if (!posterPath) {
          return;
        }
        withPoster += 1;

        const posterUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;
        const genreIds = toGenreIds(movie);
        const existing = await prisma.movie.findUnique({
          where: { tmdbId: movie.id },
          select: { genres: true, director: true, castTop: true },
        });
        const existingGenres = parseJsonStringArray(existing?.genres);
        const mergedGenres = [...new Set([...existingGenres, ...toGenres(genreIds)])];
        const mergedCredits = mergeCreditsWithGuard({
          existingDirector: existing?.director,
          existingCastTop: existing?.castTop,
          incomingDirector: parseDirector(movie.credits),
          incomingCastTop: parseCastTop(movie.credits, 8),
        });

        const persisted = await prisma.movie.upsert({
          where: { tmdbId: movie.id },
          create: {
            tmdbId: movie.id,
            title: movie.title.trim(),
            year: toYear(movie.release_date),
            synopsis: typeof movie.overview === 'string' ? movie.overview.trim() : null,
            posterUrl,
            posterLastValidatedAt: new Date(),
            genres: mergedGenres,
            keywords: parseKeywords(movie),
            country: parseCountry(movie),
            director: mergedCredits.director,
            castTop: mergedCredits.castTop,
          },
          update: {
            title: movie.title.trim(),
            year: toYear(movie.release_date),
            synopsis: typeof movie.overview === 'string' ? movie.overview.trim() : null,
            posterUrl,
            posterLastValidatedAt: new Date(),
            genres: mergedGenres,
            keywords: parseKeywords(movie),
            country: parseCountry(movie),
            director: mergedCredits.director,
            castTop: mergedCredits.castTop,
          },
          select: { id: true },
        });
        upserted += 1;

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
      },
      concurrency,
    );

    const movieCount = await prisma.movie.count();
    console.log(
      `TMDB incremental update complete: fetched=${fetched} matchedGenre=${matched} withPoster=${withPoster} upserted=${upserted} dbMovies=${movieCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('TMDB incremental update failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
