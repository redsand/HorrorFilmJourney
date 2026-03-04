import type { PrismaClient } from '@prisma/client';
import { buildTmdbMovieDetailsUrl } from './request-builders';
import { parseCastTop, parseDirector, type TmdbCredits } from './tmdb-normalization';
import { mergeCreditsWithGuard } from './credits-guard';

type TmdbDiscoverMovie = {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
};

type TmdbDiscoverResponse = {
  results?: TmdbDiscoverMovie[];
};

type TmdbMovieDetails = {
  credits?: TmdbCredits;
};

const GENRE_NAME_BY_ID: Record<number, string> = {
  27: 'horror',
  53: 'thriller',
  9648: 'mystery',
  14: 'fantasy',
  878: 'sci-fi',
  80: 'crime',
};

let lastSyncAtMs = 0;
const TMDB_FETCH_TIMEOUT_MS = 12_000;

export class TmdbSyncUnavailableError extends Error {
  code = 'TMDB_UNAVAILABLE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'TmdbSyncUnavailableError';
  }
}

function isEnabled(): boolean {
  if (!process.env.TMDB_API_KEY) {
    return false;
  }
  if (process.env.TMDB_SYNC_ENABLED === 'false') {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return true;
}

function getSyncIntervalMs(): number {
  const raw = Number.parseInt(process.env.TMDB_SYNC_INTERVAL_MINUTES ?? '10', 10);
  const minutes = Number.isInteger(raw) && raw > 0 ? raw : 10;
  return minutes * 60 * 1000;
}

function shouldRunNow(): boolean {
  const now = Date.now();
  if (lastSyncAtMs === 0) {
    return true;
  }
  return now - lastSyncAtMs >= getSyncIntervalMs();
}

function toYear(releaseDate?: string): number | undefined {
  if (!releaseDate || releaseDate.length < 4) {
    return undefined;
  }
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isInteger(year) ? year : undefined;
}

function toGenres(genreIds: number[] | undefined): string[] {
  if (!Array.isArray(genreIds)) {
    return ['horror'];
  }
  const mapped = genreIds
    .map((id) => GENRE_NAME_BY_ID[id])
    .filter((value): value is string => typeof value === 'string');
  return mapped.length > 0 ? [...new Set(mapped)] : ['horror'];
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

export async function syncTmdbHorrorCandidates(prisma: PrismaClient): Promise<void> {
  const startedAt = Date.now();
  if (!isEnabled() || !shouldRunNow()) {
    console.info('[tmdb.sync] skipped', { reason: !isEnabled() ? 'disabled' : 'interval' });
    return;
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return;
  }

  const pagesRaw = Number.parseInt(process.env.TMDB_SYNC_PAGES ?? '2', 10);
  const pages = Number.isInteger(pagesRaw) && pagesRaw > 0 ? Math.min(pagesRaw, 5) : 2;

  let anyPageSucceeded = false;
  console.info('[tmdb.sync] started', { pages });

  try {
    for (let page = 1; page <= pages; page += 1) {
      const pageStartedAt = Date.now();
      const url = new URL('https://api.themoviedb.org/3/discover/movie');
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('with_genres', '27');
      url.searchParams.set('language', 'en-US');
      url.searchParams.set('sort_by', 'popularity.desc');
      url.searchParams.set('include_adult', 'false');
      url.searchParams.set('include_video', 'false');
      url.searchParams.set('page', String(page));

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(TMDB_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        console.warn('[tmdb.sync] page failed', { page, status: response.status });
        continue;
      }
      anyPageSucceeded = true;

      const payload = (await response.json()) as TmdbDiscoverResponse;
      const movies = Array.isArray(payload.results) ? payload.results : [];
      console.info('[tmdb.sync] page loaded', {
        page,
        durationMs: Date.now() - pageStartedAt,
        movieCount: movies.length,
      });

      for (const movie of movies) {
        const tmdbId = movie.id;
        const title = movie.title?.trim();
        const posterPath = movie.poster_path?.trim();
        if (!Number.isInteger(tmdbId) || !title || !posterPath) {
          continue;
        }

        const posterUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;
        const existing = await prisma.movie.findUnique({
          where: { tmdbId },
          select: { director: true, castTop: true },
        });

        let details: TmdbMovieDetails | null = null;
        try {
          const detailsUrl = buildTmdbMovieDetailsUrl({
            tmdbId,
            apiKey,
            appendToResponse: 'credits',
          });
          const detailsResponse = await fetch(detailsUrl.toString(), {
            method: 'GET',
            signal: AbortSignal.timeout(TMDB_FETCH_TIMEOUT_MS),
          });
          if (detailsResponse.ok) {
            details = await detailsResponse.json() as TmdbMovieDetails;
          }
        } catch {
          details = null;
        }

        const mergedCredits = mergeCreditsWithGuard({
          existingDirector: existing?.director,
          existingCastTop: existing?.castTop,
          incomingDirector: parseDirector(details?.credits),
          incomingCastTop: parseCastTop(details?.credits, 8),
        });

        const persisted = await prisma.movie.upsert({
          where: { tmdbId },
          create: {
            tmdbId,
            title,
            year: toYear(movie.release_date),
            posterUrl,
            posterLastValidatedAt: new Date(),
            genres: toGenres(movie.genre_ids),
            director: mergedCredits.director,
            castTop: mergedCredits.castTop,
          },
          update: {
            title,
            year: toYear(movie.release_date),
            posterUrl,
            posterLastValidatedAt: new Date(),
            genres: toGenres(movie.genre_ids),
            director: mergedCredits.director,
            castTop: mergedCredits.castTop,
          },
          select: { id: true },
        });

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
    }
  } catch {
    throw new TmdbSyncUnavailableError('TMDB is currently unavailable. Please try again in a moment.');
  } finally {
    lastSyncAtMs = Date.now();
    console.info('[tmdb.sync] completed', {
      durationMs: Date.now() - startedAt,
      anyPageSucceeded,
    });
  }

  if (!anyPageSucceeded) {
    throw new TmdbSyncUnavailableError('TMDB is currently unavailable. Please try again in a moment.');
  }
}
