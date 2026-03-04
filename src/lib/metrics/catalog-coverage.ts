export type CoverageRating = {
  source: string;
  value: number;
};

export type VoteCoverageMovieInput = {
  tmdbId: number;
  ratings?: CoverageRating[] | null;
};

export type VoteCoverageBreakdown = {
  totalTmdbMovies: number;
  voteCountFieldPresent: number;
  voteCountPositive: number;
  voteCountZero: number;
  voteCountNull: number;
  voteCountFieldPresence: number;
  voteCountPositiveCoverage: number;
  voteCountZeroRate: number;
  voteCountNullRate: number;
  nullTmdbIds: number[];
  zeroTmdbIds: number[];
};

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function toRate(count: number, total: number): number {
  if (total <= 0) return 0;
  return round6(count / total);
}

function resolveRawTmdbVoteCount(ratings: CoverageRating[] | null | undefined): number | null {
  if (!Array.isArray(ratings)) return null;
  const row = ratings.find((rating) => rating.source.toUpperCase() === 'TMDB_VOTE_COUNT');
  if (!row) return null;
  if (!Number.isFinite(row.value)) return null;
  return Number(row.value);
}

export function computeVoteCountCoverageBreakdown(movies: VoteCoverageMovieInput[]): VoteCoverageBreakdown {
  const tmdbMovies = movies.filter((movie) => Number.isInteger(movie.tmdbId) && movie.tmdbId > 0);
  let voteCountFieldPresent = 0;
  let voteCountPositive = 0;
  let voteCountZero = 0;
  const nullTmdbIds: number[] = [];
  const zeroTmdbIds: number[] = [];

  for (const movie of tmdbMovies) {
    const rawVoteCount = resolveRawTmdbVoteCount(movie.ratings);
    if (rawVoteCount === null) {
      nullTmdbIds.push(movie.tmdbId);
      continue;
    }
    voteCountFieldPresent += 1;
    if (rawVoteCount > 0) {
      voteCountPositive += 1;
      continue;
    }
    if (rawVoteCount === 0) {
      voteCountZero += 1;
      zeroTmdbIds.push(movie.tmdbId);
      continue;
    }
    nullTmdbIds.push(movie.tmdbId);
  }

  const totalTmdbMovies = tmdbMovies.length;
  const voteCountNull = totalTmdbMovies - voteCountFieldPresent;
  return {
    totalTmdbMovies,
    voteCountFieldPresent,
    voteCountPositive,
    voteCountZero,
    voteCountNull,
    voteCountFieldPresence: toRate(voteCountFieldPresent, totalTmdbMovies),
    voteCountPositiveCoverage: toRate(voteCountPositive, totalTmdbMovies),
    voteCountZeroRate: toRate(voteCountZero, totalTmdbMovies),
    voteCountNullRate: toRate(voteCountNull, totalTmdbMovies),
    nullTmdbIds,
    zeroTmdbIds,
  };
}

export function computeVoteCountFieldPresence(movies: VoteCoverageMovieInput[]): number {
  return computeVoteCountCoverageBreakdown(movies).voteCountFieldPresence;
}

export function computeVoteCountPositiveCoverage(movies: VoteCoverageMovieInput[]): number {
  return computeVoteCountCoverageBreakdown(movies).voteCountPositiveCoverage;
}

