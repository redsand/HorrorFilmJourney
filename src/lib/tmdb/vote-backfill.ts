export type TmdbVotePayload = {
  vote_count?: number | null;
  vote_average?: number | null;
  popularity?: number | null;
};

export type ParsedTmdbVoteMetrics = {
  voteCount: number | null;
  voteAverage: number | null;
  popularity: number | null;
};

export function buildTmdbVoteBackfillUrl(input: {
  tmdbId: number;
  apiKey: string;
  language?: string;
}): URL {
  const url = new URL(`https://api.themoviedb.org/3/movie/${input.tmdbId}`);
  url.searchParams.set('api_key', input.apiKey);
  url.searchParams.set('language', input.language ?? 'en-US');
  return url;
}

export function parseTmdbVoteMetrics(payload: TmdbVotePayload): ParsedTmdbVoteMetrics {
  const voteCount = (typeof payload.vote_count === 'number' && Number.isFinite(payload.vote_count) && payload.vote_count >= 0)
    ? Math.round(payload.vote_count)
    : null;
  const voteAverage = (typeof payload.vote_average === 'number' && Number.isFinite(payload.vote_average) && payload.vote_average >= 0)
    ? Number(payload.vote_average.toFixed(3))
    : null;
  const popularity = (typeof payload.popularity === 'number' && Number.isFinite(payload.popularity) && payload.popularity > 0)
    ? Number(payload.popularity.toFixed(3))
    : null;
  return { voteCount, voteAverage, popularity };
}

function toTmdbScoreRaw(value: number): string {
  return `${value.toFixed(1)}/10`;
}

function toPopularityScore(input: number): { value: number; rawValue: string } {
  const normalized = Math.max(1, Math.min(100, Math.round(input)));
  return {
    value: normalized,
    rawValue: `${normalized}/100`,
  };
}

export function buildVoteRatingUpserts(input: {
  movieId: string;
  metrics: ParsedTmdbVoteMetrics;
  includePopularity: boolean;
}): Array<{
  where: { movieId_source: { movieId: string; source: string } };
  create: { movieId: string; source: string; value: number; scale: string; rawValue: string };
  update: { value: number; scale: string; rawValue: string };
}> {
  const out: Array<{
    where: { movieId_source: { movieId: string; source: string } };
    create: { movieId: string; source: string; value: number; scale: string; rawValue: string };
    update: { value: number; scale: string; rawValue: string };
  }> = [];

  if (typeof input.metrics.voteAverage === 'number') {
    out.push({
      where: { movieId_source: { movieId: input.movieId, source: 'TMDB' } },
      create: {
        movieId: input.movieId,
        source: 'TMDB',
        value: input.metrics.voteAverage,
        scale: '10',
        rawValue: toTmdbScoreRaw(input.metrics.voteAverage),
      },
      update: {
        value: input.metrics.voteAverage,
        scale: '10',
        rawValue: toTmdbScoreRaw(input.metrics.voteAverage),
      },
    });
  }

  if (typeof input.metrics.voteCount === 'number') {
    out.push({
      where: { movieId_source: { movieId: input.movieId, source: 'TMDB_VOTE_COUNT' } },
      create: {
        movieId: input.movieId,
        source: 'TMDB_VOTE_COUNT',
        value: input.metrics.voteCount,
        scale: 'COUNT',
        rawValue: `${input.metrics.voteCount}`,
      },
      update: {
        value: input.metrics.voteCount,
        scale: 'COUNT',
        rawValue: `${input.metrics.voteCount}`,
      },
    });
  }

  if (input.includePopularity && typeof input.metrics.popularity === 'number') {
    const popularity = toPopularityScore(input.metrics.popularity);
    out.push({
      where: { movieId_source: { movieId: input.movieId, source: 'TMDB_POPULARITY' } },
      create: {
        movieId: input.movieId,
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

  return out;
}

