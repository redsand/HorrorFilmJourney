import { buildTmdbMovieDetailsUrl } from './request-builders';
import { parseKeywords, parseDirector, parseCastTop, type TmdbCredits } from './tmdb-normalization';
import { parseTmdbRuntimeMinutes, buildRuntimeRatingUpsert } from './runtime-backfill';
import { buildVoteRatingUpserts, parseTmdbVoteMetrics } from './vote-backfill';

export type TmdbMetadataBackfillPayload = {
  overview?: string | null;
  runtime?: number | null;
  vote_count?: number | null;
  vote_average?: number | null;
  popularity?: number | null;
  credits?: TmdbCredits;
  keywords?: { keywords?: Array<{ name?: string }> };
};

export type ExistingMovieMetadata = {
  synopsis: string | null;
  director: string | null;
  castTop: unknown;
  keywords: unknown;
  ratings: Array<{ source: string; value: number }>;
};

export type ParsedMetadataBackfill = {
  synopsis: string | null;
  director: string | null;
  castTop: Array<{ name: string; role: string }>;
  keywords: string[];
  runtimeMinutes: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
};

function parseCastNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
        return ((entry as { name: string }).name).trim();
      }
      return '';
    })
    .filter((entry) => entry.length > 0);
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function buildTmdbSeason1MetadataBackfillUrl(input: {
  tmdbId: number;
  apiKey: string;
  language?: string;
}): URL {
  return buildTmdbMovieDetailsUrl({
    tmdbId: input.tmdbId,
    apiKey: input.apiKey,
    language: input.language,
    appendToResponse: 'credits,keywords',
  });
}

export function parseTmdbMetadataBackfill(payload: TmdbMetadataBackfillPayload): ParsedMetadataBackfill {
  const synopsis = typeof payload.overview === 'string' && payload.overview.trim().length > 0
    ? payload.overview.trim()
    : null;
  const runtimeMinutes = parseTmdbRuntimeMinutes(payload);
  const vote = parseTmdbVoteMetrics(payload);
  return {
    synopsis,
    director: parseDirector(payload.credits),
    castTop: parseCastTop(payload.credits, 8),
    keywords: parseKeywords(payload),
    runtimeMinutes,
    voteAverage: vote.voteAverage,
    voteCount: vote.voteCount,
    popularity: vote.popularity,
  };
}

export function buildSeason1MetadataUpdate(input: {
  movieId: string;
  existing: ExistingMovieMetadata;
  parsed: ParsedMetadataBackfill;
}): {
  movieData: {
    synopsis?: string;
    director?: string;
    castTop?: Array<{ name: string; role: string }>;
    keywords?: string[];
  };
  runtimeUpsert: ReturnType<typeof buildRuntimeRatingUpsert> | null;
  voteUpserts: ReturnType<typeof buildVoteRatingUpserts>;
  changedFields: string[];
} {
  const changedFields: string[] = [];
  const movieData: {
    synopsis?: string;
    director?: string;
    castTop?: Array<{ name: string; role: string }>;
    keywords?: string[];
  } = {};

  const missingOverview = !(typeof input.existing.synopsis === 'string' && input.existing.synopsis.trim().length > 0);
  if (missingOverview && input.parsed.synopsis) {
    movieData.synopsis = input.parsed.synopsis;
    changedFields.push('overview');
  }

  const missingDirector = !(typeof input.existing.director === 'string' && input.existing.director.trim().length > 0);
  if (missingDirector && input.parsed.director) {
    movieData.director = input.parsed.director;
    changedFields.push('director');
  }

  const missingCast = parseCastNames(input.existing.castTop).length === 0;
  if (missingCast && input.parsed.castTop.length > 0) {
    movieData.castTop = input.parsed.castTop;
    changedFields.push('castTop');
  }

  const missingKeywords = parseJsonStringArray(input.existing.keywords).length === 0;
  if (missingKeywords && input.parsed.keywords.length > 0) {
    movieData.keywords = input.parsed.keywords;
    changedFields.push('keywords');
  }

  const hasRuntime = input.existing.ratings.some((rating) => rating.source === 'TMDB_RUNTIME' && rating.value > 0);
  const runtimeUpsert = (!hasRuntime && input.parsed.runtimeMinutes !== null)
    ? buildRuntimeRatingUpsert(input.movieId, input.parsed.runtimeMinutes)
    : null;
  if (runtimeUpsert) changedFields.push('runtime');

  const hasPopularity = input.existing.ratings.some((rating) => rating.source === 'TMDB_POPULARITY' && rating.value > 0);
  const voteUpserts = buildVoteRatingUpserts({
    movieId: input.movieId,
    metrics: {
      voteAverage: input.parsed.voteAverage,
      voteCount: input.parsed.voteCount,
      popularity: input.parsed.popularity,
    },
    includePopularity: !hasPopularity,
  }).filter((upsert) => {
    if (upsert.where.movieId_source.source === 'TMDB') {
      const has = input.existing.ratings.some((rating) => rating.source === 'TMDB' && rating.value > 0);
      return !has;
    }
    if (upsert.where.movieId_source.source === 'TMDB_VOTE_COUNT') {
      const has = input.existing.ratings.some((rating) => rating.source === 'TMDB_VOTE_COUNT' && rating.value > 0);
      return !has;
    }
    if (upsert.where.movieId_source.source === 'TMDB_POPULARITY') {
      return !hasPopularity;
    }
    return true;
  });
  if (voteUpserts.some((upsert) => upsert.where.movieId_source.source === 'TMDB_VOTE_COUNT')) {
    changedFields.push('voteCount');
  }

  return { movieData, runtimeUpsert, voteUpserts, changedFields: [...new Set(changedFields)] };
}
