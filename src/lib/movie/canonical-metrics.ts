export type CanonicalRating = {
  source: string;
  value: number;
  scale?: string | null;
};

export type CanonicalMetricInput = {
  runtime?: number | null;
  tmdbVoteCount?: number | null;
  tmdbVoteAverage?: number | null;
  popularity?: number | null;
  ratings?: CanonicalRating[] | null;
};

export type CanonicalMovieSignals = {
  runtime: number | null;
  tmdbVoteCount: number | null;
  tmdbVoteAverage: number | null;
  popularity: number | null;
};

type CanonicalCoverageMovieInput = {
  tmdbId: number;
  ratings: CanonicalRating[];
};

function toPositiveNumberOrNull(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const numeric = Number(value);
  return numeric > 0 ? numeric : null;
}

function findRatingValue(ratings: CanonicalRating[] | null | undefined, source: string): number | null {
  if (!Array.isArray(ratings)) return null;
  const value = ratings.find((rating) => rating.source.toUpperCase() === source)?.value;
  return toPositiveNumberOrNull(value);
}

export function resolveCanonicalMovieSignals(input: CanonicalMetricInput): CanonicalMovieSignals {
  const ratings = input.ratings ?? [];
  const runtime = toPositiveNumberOrNull(input.runtime) ?? findRatingValue(ratings, 'TMDB_RUNTIME');
  const tmdbVoteCount = toPositiveNumberOrNull(input.tmdbVoteCount) ?? findRatingValue(ratings, 'TMDB_VOTE_COUNT');
  const tmdbVoteAverage = toPositiveNumberOrNull(input.tmdbVoteAverage) ?? findRatingValue(ratings, 'TMDB');
  const popularity = toPositiveNumberOrNull(input.popularity) ?? findRatingValue(ratings, 'TMDB_POPULARITY');
  return { runtime, tmdbVoteCount, tmdbVoteAverage, popularity };
}

export function hasCanonicalRuntime(input: CanonicalMetricInput): boolean {
  return resolveCanonicalMovieSignals(input).runtime !== null;
}

export function hasCanonicalVoteCount(input: CanonicalMetricInput): boolean {
  return resolveCanonicalMovieSignals(input).tmdbVoteCount !== null;
}

export function computeCanonicalRuntimeVoteCoverage(movies: CanonicalCoverageMovieInput[]): {
  totalTmdbMovies: number;
  runtimePresent: number;
  voteCountPresent: number;
  runtimeCoverage: number;
  voteCountCoverage: number;
  missingRuntimeIds: number[];
  missingVoteCountIds: number[];
} {
  const tmdbMovies = movies.filter((movie) => Number.isInteger(movie.tmdbId) && movie.tmdbId > 0);
  let runtimePresent = 0;
  let voteCountPresent = 0;
  const missingRuntimeIds: number[] = [];
  const missingVoteCountIds: number[] = [];

  for (const movie of tmdbMovies) {
    const canonical = resolveCanonicalMovieSignals({ ratings: movie.ratings });
    if (canonical.runtime !== null) {
      runtimePresent += 1;
    } else {
      missingRuntimeIds.push(movie.tmdbId);
    }
    if (canonical.tmdbVoteCount !== null) {
      voteCountPresent += 1;
    } else {
      missingVoteCountIds.push(movie.tmdbId);
    }
  }

  const total = tmdbMovies.length;
  const toPct = (n: number): number => (total > 0 ? Number((n / total).toFixed(6)) : 0);
  return {
    totalTmdbMovies: total,
    runtimePresent,
    voteCountPresent,
    runtimeCoverage: toPct(runtimePresent),
    voteCountCoverage: toPct(voteCountPresent),
    missingRuntimeIds,
    missingVoteCountIds,
  };
}
