import { computeReceptionCount } from '../movie/reception.ts';

export type CoverageGateThresholds = {
  runtimeCoverageMin: number;
  voteCountCoverageMin: number;
  directorAndCastTopCoverageMin: number;
  receptionCountCoverageMin: number;
  sampleSize: number;
};

export type CoverageMovieInput = {
  tmdbId: number;
  director: string | null;
  castTop: unknown;
  ratings: Array<{ source: string; value: number; rawValue?: string | null }>;
};

export type CoverageGateMetrics = {
  totalTmdbMovies: number;
  runtimeCoverage: number;
  voteCountCoverage: number;
  directorAndCastTopCoverage: number;
  receptionCountCoverage: number;
  sampleIds: {
    missingRuntime: number[];
    missingVoteCount: number[];
    missingDirectorOrCast: number[];
    missingReception: number[];
  };
};

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(6));
}

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

function hasRuntimeRating(ratings: CoverageMovieInput['ratings']): boolean {
  const runtime = ratings.find((rating) => rating.source.toUpperCase() === 'TMDB_RUNTIME')?.value ?? 0;
  return Number.isFinite(runtime) && runtime > 0;
}

function hasVoteCountRating(ratings: CoverageMovieInput['ratings']): boolean {
  const voteCount = ratings.find((rating) => rating.source.toUpperCase() === 'TMDB_VOTE_COUNT')?.value ?? 0;
  return Number.isFinite(voteCount) && voteCount > 0;
}

function hasDirectorAndCast(movie: CoverageMovieInput): boolean {
  const hasDirector = Boolean(movie.director && movie.director.trim().length > 0);
  const hasCast = parseCastNames(movie.castTop).length > 0;
  return hasDirector && hasCast;
}

function hasReception(movie: CoverageMovieInput): boolean {
  return computeReceptionCount(movie.ratings) > 0;
}

export function computeCoverageGateMetrics(
  movies: CoverageMovieInput[],
  sampleSize = 10,
): CoverageGateMetrics {
  const tmdbMovies = movies.filter((movie) => Number.isInteger(movie.tmdbId) && movie.tmdbId > 0);
  const missingRuntime: number[] = [];
  const missingVoteCount: number[] = [];
  const missingDirectorOrCast: number[] = [];
  const missingReception: number[] = [];

  for (const movie of tmdbMovies) {
    if (!hasRuntimeRating(movie.ratings)) missingRuntime.push(movie.tmdbId);
    if (!hasVoteCountRating(movie.ratings)) missingVoteCount.push(movie.tmdbId);
    if (!hasDirectorAndCast(movie)) missingDirectorOrCast.push(movie.tmdbId);
    if (!hasReception(movie)) missingReception.push(movie.tmdbId);
  }

  const total = tmdbMovies.length;
  return {
    totalTmdbMovies: total,
    runtimeCoverage: toPct(total - missingRuntime.length, total),
    voteCountCoverage: toPct(total - missingVoteCount.length, total),
    directorAndCastTopCoverage: toPct(total - missingDirectorOrCast.length, total),
    receptionCountCoverage: toPct(total - missingReception.length, total),
    sampleIds: {
      missingRuntime: missingRuntime.slice(0, sampleSize),
      missingVoteCount: missingVoteCount.slice(0, sampleSize),
      missingDirectorOrCast: missingDirectorOrCast.slice(0, sampleSize),
      missingReception: missingReception.slice(0, sampleSize),
    },
  };
}

export function evaluateCoverageGate(
  metrics: CoverageGateMetrics,
  thresholds: CoverageGateThresholds,
): { pass: boolean; details: string; failures: string[] } {
  const failures: string[] = [];
  if (metrics.runtimeCoverage < thresholds.runtimeCoverageMin) {
    failures.push(
      `runtimeCoverage ${(metrics.runtimeCoverage * 100).toFixed(2)}% < ${(thresholds.runtimeCoverageMin * 100).toFixed(2)}% sampleTmdbIds=[${metrics.sampleIds.missingRuntime.join(',')}]`,
    );
  }
  if (metrics.voteCountCoverage < thresholds.voteCountCoverageMin) {
    failures.push(
      `voteCountCoverage ${(metrics.voteCountCoverage * 100).toFixed(2)}% < ${(thresholds.voteCountCoverageMin * 100).toFixed(2)}% sampleTmdbIds=[${metrics.sampleIds.missingVoteCount.join(',')}]`,
    );
  }
  if (metrics.directorAndCastTopCoverage < thresholds.directorAndCastTopCoverageMin) {
    failures.push(
      `directorAndCastTopCoverage ${(metrics.directorAndCastTopCoverage * 100).toFixed(2)}% < ${(thresholds.directorAndCastTopCoverageMin * 100).toFixed(2)}% sampleTmdbIds=[${metrics.sampleIds.missingDirectorOrCast.join(',')}]`,
    );
  }
  if (metrics.receptionCountCoverage < thresholds.receptionCountCoverageMin) {
    failures.push(
      `receptionCountCoverage ${(metrics.receptionCountCoverage * 100).toFixed(2)}% < ${(thresholds.receptionCountCoverageMin * 100).toFixed(2)}% sampleTmdbIds=[${metrics.sampleIds.missingReception.join(',')}]`,
    );
  }
  return {
    pass: failures.length === 0,
    details: failures.length === 0
      ? `runtime=${(metrics.runtimeCoverage * 100).toFixed(2)} voteCount=${(metrics.voteCountCoverage * 100).toFixed(2)} directorCast=${(metrics.directorAndCastTopCoverage * 100).toFixed(2)} reception=${(metrics.receptionCountCoverage * 100).toFixed(2)}`
      : failures.join(' | '),
    failures,
  };
}
