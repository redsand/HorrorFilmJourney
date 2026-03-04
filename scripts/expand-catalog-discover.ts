import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureLocalDatabaseOrThrow, parseOption } from './catalog-release-utils';
import {
  parseCastTop,
  parseCountry,
  parseDirector,
  parseKeywords,
  toGenreNames,
  toGenreIds,
} from '../src/lib/tmdb/tmdb-normalization';
import { mergeCreditsWithGuard } from '../src/lib/tmdb/credits-guard';

type TmdbDiscoverMovie = {
  id?: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
};

type TmdbDiscoverResponse = {
  page?: number;
  total_pages?: number;
  total_results?: number;
  results?: TmdbDiscoverMovie[];
};

type TmdbMovieDetails = {
  id?: number;
  title?: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  genres?: Array<{ id?: number; name?: string }>;
  production_countries?: Array<{ name?: string }>;
  keywords?: { keywords?: Array<{ name?: string }> };
  credits?: {
    cast?: Array<{ name?: string; character?: string }>;
    crew?: Array<{ name?: string; job?: string }>;
  };
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
};

type Counters = {
  pagesFetched: number;
  discoverMoviesSeen: number;
  uniqueTmdbIdsFromDiscover: number;
  minimalUpsertedMovies: number;
  minimalSkippedNoTitle: number;
  minimalSkippedNoPoster: number;
  detailsFetched: number;
  enrichedMovies: number;
  upsertedRatings: number;
  enrichSkippedNoTitle: number;
  enrichSkippedNoPoster: number;
};

const FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_PAGES = 2000;
const DEFAULT_START_PAGE = 1;

function parseIntOption(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toYear(releaseDate?: string): number | undefined {
  if (!releaseDate || releaseDate.length < 4) {
    return undefined;
  }
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isInteger(year) ? year : undefined;
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

async function fetchDiscoverPage(apiKey: string, page: number): Promise<TmdbDiscoverResponse> {
  const url = new URL('https://api.themoviedb.org/3/discover/movie');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', process.env.TMDB_EXPAND_LANGUAGE ?? 'en-US');
  url.searchParams.set('region', process.env.TMDB_EXPAND_REGION ?? 'US');
  url.searchParams.set('sort_by', 'popularity.desc');
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('include_video', 'false');
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`discover page ${page} failed status=${response.status}`);
  }
  return response.json() as Promise<TmdbDiscoverResponse>;
}

async function fetchMovieDetails(apiKey: string, tmdbId: number): Promise<TmdbMovieDetails | null> {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', process.env.TMDB_EXPAND_LANGUAGE ?? 'en-US');
  url.searchParams.set('append_to_response', 'keywords,credits');
  try {
    const response = await fetch(url.toString(), {
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

async function main(): Promise<void> {
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is required');
  }

  const startPage = parseIntOption(parseOption(process.argv.slice(2), '--startPage'), DEFAULT_START_PAGE);
  const maxPages = Math.min(parseIntOption(parseOption(process.argv.slice(2), '--maxPages'), DEFAULT_MAX_PAGES), 2000);
  const dryRun = process.argv.includes('--dryRun');
  const outputDir = parseOption(process.argv.slice(2), '--outputDir')
    ?? resolve('artifacts/catalog-expansion', new Date().toISOString().replace(/[:.]/g, '-'));

  const prisma = new PrismaClient();
  const counters: Counters = {
    pagesFetched: 0,
    discoverMoviesSeen: 0,
    uniqueTmdbIdsFromDiscover: 0,
    minimalUpsertedMovies: 0,
    minimalSkippedNoTitle: 0,
    minimalSkippedNoPoster: 0,
    detailsFetched: 0,
    enrichedMovies: 0,
    upsertedRatings: 0,
    enrichSkippedNoTitle: 0,
    enrichSkippedNoPoster: 0,
  };

  try {
    await mkdir(outputDir, { recursive: true });
    const discoverByTmdbId = new Map<number, TmdbDiscoverMovie>();
    let hardStopPage = startPage + maxPages - 1;

    for (let page = startPage; page <= hardStopPage; page += 1) {
      let payload: TmdbDiscoverResponse;
      try {
        // eslint-disable-next-line no-await-in-loop
        payload = await fetchDiscoverPage(apiKey, page);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('status=422') || message.includes('status=400')) {
          break;
        }
        throw error;
      }
      counters.pagesFetched += 1;
      const totalPages = Number.isInteger(payload.total_pages) ? (payload.total_pages as number) : null;
      if (totalPages && totalPages > 0) {
        hardStopPage = Math.min(hardStopPage, totalPages);
      }
      const results = Array.isArray(payload.results) ? payload.results : [];
      counters.discoverMoviesSeen += results.length;

      for (const movie of results) {
        const tmdbId = movie.id;
        if (!tmdbId || !Number.isInteger(tmdbId) || tmdbId <= 0 || discoverByTmdbId.has(tmdbId)) {
          continue;
        }
        discoverByTmdbId.set(tmdbId, movie);
        counters.uniqueTmdbIdsFromDiscover += 1;
      }
    }

    // Phase 1: Store minimal records from discover results.
    const sortedTmdbIds = [...discoverByTmdbId.keys()].sort((a, b) => a - b);
    if (!dryRun) {
      for (const tmdbId of sortedTmdbIds) {
        const discover = discoverByTmdbId.get(tmdbId);
        if (!discover) continue;
        const title = discover.title?.trim();
        if (!title) {
          counters.minimalSkippedNoTitle += 1;
          continue;
        }
        const posterPath = discover.poster_path?.trim();
        if (!posterPath) {
          counters.minimalSkippedNoPoster += 1;
          continue;
        }
        const posterUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;
        const incomingGenres = toGenreNames(discover.genre_ids ?? []);

        // eslint-disable-next-line no-await-in-loop
        const existing = await prisma.movie.findUnique({
          where: { tmdbId },
          select: { genres: true, synopsis: true, country: true, director: true, castTop: true, keywords: true },
        });
        const mergedGenres = [...new Set([...parseJsonStringArray(existing?.genres), ...incomingGenres])];
        const synopsis = (existing?.synopsis && existing.synopsis.trim().length > 0)
          ? existing.synopsis
          : `${title} (${toYear(discover.release_date) ?? 'n/a'})`;

        // eslint-disable-next-line no-await-in-loop
        await prisma.movie.upsert({
          where: { tmdbId },
          create: {
            tmdbId,
            title,
            year: toYear(discover.release_date),
            synopsis,
            posterUrl,
            posterLastValidatedAt: new Date(),
            genres: mergedGenres,
            keywords: parseKeywords({ keywords: { keywords: [] } }),
            country: existing?.country ?? 'Unknown',
            director: existing?.director ?? null,
            castTop: existing?.castTop ?? [],
          },
          update: {
            title,
            year: toYear(discover.release_date),
            synopsis,
            posterUrl,
            posterLastValidatedAt: new Date(),
            genres: mergedGenres,
          },
        });
        counters.minimalUpsertedMovies += 1;
      }
    }

    // Phase 2: Enrich records via detail fetch.
    for (const tmdbId of sortedTmdbIds) {
      // eslint-disable-next-line no-await-in-loop
      const details = await fetchMovieDetails(apiKey, tmdbId);
      counters.detailsFetched += 1;
      if (!details?.id || !details.title || details.title.trim().length === 0) {
        counters.enrichSkippedNoTitle += 1;
        continue;
      }

      const posterPath = details.poster_path?.trim();
      if (!posterPath) {
        counters.enrichSkippedNoPoster += 1;
        continue;
      }
      const title = details.title.trim();
      const posterUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;
      const genreIds = toGenreIds(details);
      const incomingGenres = toGenreNames(genreIds);

      if (dryRun) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const existing = await prisma.movie.findUnique({
        where: { tmdbId },
        select: { genres: true, director: true, castTop: true },
      });
      const mergedGenres = [...new Set([...parseJsonStringArray(existing?.genres), ...incomingGenres])];
      const mergedCredits = mergeCreditsWithGuard({
        existingDirector: existing?.director,
        existingCastTop: existing?.castTop,
        incomingDirector: parseDirector(details.credits),
        incomingCastTop: parseCastTop(details.credits, 8),
      });
      const synopsis = typeof details.overview === 'string' && details.overview.trim().length > 0
        ? details.overview.trim()
        : `${title} (${toYear(details.release_date) ?? 'n/a'})`;

      // eslint-disable-next-line no-await-in-loop
      const persisted = await prisma.movie.upsert({
        where: { tmdbId },
        create: {
          tmdbId,
          title,
          year: toYear(details.release_date),
          synopsis,
          posterUrl,
          posterLastValidatedAt: new Date(),
          genres: mergedGenres,
          keywords: parseKeywords(details),
          country: parseCountry(details),
          director: mergedCredits.director,
          castTop: mergedCredits.castTop,
        },
        update: {
          title,
          year: toYear(details.release_date),
          synopsis,
          posterUrl,
          posterLastValidatedAt: new Date(),
          genres: mergedGenres,
          keywords: parseKeywords(details),
          country: parseCountry(details),
          director: mergedCredits.director,
          castTop: mergedCredits.castTop,
        },
        select: { id: true },
      });
      counters.enrichedMovies += 1;

      const imdb = imdbApprox(details.vote_average);
      const tmdb = imdbApprox(details.vote_average);
      const voteCount = typeof details.vote_count === 'number' && Number.isFinite(details.vote_count) && details.vote_count > 0
        ? Math.round(details.vote_count)
        : null;
      const popularity = tmdbPopularityScore(details.popularity);

      // eslint-disable-next-line no-await-in-loop
      await prisma.movieRating.upsert({
        where: { movieId_source: { movieId: persisted.id, source: 'IMDB' } },
        create: { movieId: persisted.id, source: 'IMDB', value: imdb.value, scale: '10', rawValue: imdb.rawValue },
        update: { value: imdb.value, scale: '10', rawValue: imdb.rawValue },
      });
      counters.upsertedRatings += 1;
      // eslint-disable-next-line no-await-in-loop
      await prisma.movieRating.upsert({
        where: { movieId_source: { movieId: persisted.id, source: 'TMDB' } },
        create: { movieId: persisted.id, source: 'TMDB', value: tmdb.value, scale: '10', rawValue: tmdb.rawValue },
        update: { value: tmdb.value, scale: '10', rawValue: tmdb.rawValue },
      });
      counters.upsertedRatings += 1;
      // eslint-disable-next-line no-await-in-loop
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
      counters.upsertedRatings += 1;
      if (voteCount !== null) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.movieRating.upsert({
          where: { movieId_source: { movieId: persisted.id, source: 'TMDB_VOTE_COUNT' } },
          create: {
            movieId: persisted.id,
            source: 'TMDB_VOTE_COUNT',
            value: voteCount,
            scale: 'COUNT',
            rawValue: `${voteCount}`,
          },
          update: {
            value: voteCount,
            scale: 'COUNT',
            rawValue: `${voteCount}`,
          },
        });
        counters.upsertedRatings += 1;
      }
    }

    const movieCount = dryRun ? null : await prisma.movie.count();
    const summary = {
      generatedAt: new Date().toISOString(),
      options: { startPage, maxPages, dryRun, outputDir },
      counters,
      dbMovieCount: movieCount,
      note: 'No Season 1 assignment operations are performed by this script.',
    };
    await writeFile(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('expand-catalog-discover failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
