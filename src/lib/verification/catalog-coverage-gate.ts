import { computeReceptionCount } from '../movie/reception.ts';
import { computeCanonicalRuntimeVoteCoverage } from '../movie/canonical-metrics.ts';
import { computeVoteCountCoverageBreakdown } from '../metrics/catalog-coverage.ts';

export type CoverageGateThresholds = {
  runtimeCoverageMin: number;
  voteCountFieldPresenceMin: number;
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
  voteCountFieldPresence: number;
  voteCountPositiveCoverage: number;
  voteCountZeroRate: number;
  voteCountNullRate: number;
  directorAndCastTopCoverage: number;
  receptionCountCoverage: number;
  sampleIds: {
    missingRuntime: number[];
    missingVoteCountField: number[];
    zeroVoteCount: number[];
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
  const canonicalCoverage = computeCanonicalRuntimeVoteCoverage(
    tmdbMovies.map((movie) => ({ tmdbId: movie.tmdbId, ratings: movie.ratings })),
  );
  const voteCoverage = computeVoteCountCoverageBreakdown(
    tmdbMovies.map((movie) => ({ tmdbId: movie.tmdbId, ratings: movie.ratings })),
  );
  const missingRuntime = canonicalCoverage.missingRuntimeIds;
  const missingVoteCountField = voteCoverage.nullTmdbIds;
  const zeroVoteCount = voteCoverage.zeroTmdbIds;
  const missingDirectorOrCast: number[] = [];
  const missingReception: number[] = [];

  for (const movie of tmdbMovies) {
    if (!hasDirectorAndCast(movie)) missingDirectorOrCast.push(movie.tmdbId);
    if (!hasReception(movie)) missingReception.push(movie.tmdbId);
  }

  const total = tmdbMovies.length;
  return {
    totalTmdbMovies: total,
    runtimeCoverage: canonicalCoverage.runtimeCoverage,
    voteCountFieldPresence: voteCoverage.voteCountFieldPresence,
    voteCountPositiveCoverage: voteCoverage.voteCountPositiveCoverage,
    voteCountZeroRate: voteCoverage.voteCountZeroRate,
    voteCountNullRate: voteCoverage.voteCountNullRate,
    directorAndCastTopCoverage: toPct(total - missingDirectorOrCast.length, total),
    receptionCountCoverage: toPct(total - missingReception.length, total),
    sampleIds: {
      missingRuntime: missingRuntime.slice(0, sampleSize),
      missingVoteCountField: missingVoteCountField.slice(0, sampleSize),
      zeroVoteCount: zeroVoteCount.slice(0, sampleSize),
      missingDirectorOrCast: missingDirectorOrCast.slice(0, sampleSize),
      missingReception: missingReception.slice(0, sampleSize),
    },
  };
}

export function evaluateCoverageGate(
  metrics: CoverageGateMetrics,
  thresholds: CoverageGateThresholds,
): { pass: boolean; details: string; failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  if (metrics.runtimeCoverage < thresholds.runtimeCoverageMin) {
    failures.push(
      `runtimeCoverage ${(metrics.runtimeCoverage * 100).toFixed(2)}% < ${(thresholds.runtimeCoverageMin * 100).toFixed(2)}% sampleTmdbIds=[${metrics.sampleIds.missingRuntime.join(',')}]`,
    );
  }
  if (metrics.voteCountFieldPresence < thresholds.voteCountFieldPresenceMin) {
    failures.push(
      `voteCountFieldPresence ${(metrics.voteCountFieldPresence * 100).toFixed(2)}% < ${(thresholds.voteCountFieldPresenceMin * 100).toFixed(2)}% sampleTmdbIds=[${metrics.sampleIds.missingVoteCountField.join(',')}]`,
    );
  }
  if (metrics.voteCountZeroRate > 0.2) {
    warnings.push(
      `voteCountZeroRate ${(metrics.voteCountZeroRate * 100).toFixed(2)}% > 20.00% sampleTmdbIds=[${metrics.sampleIds.zeroVoteCount.join(',')}]`,
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
      ? `runtime=${(metrics.runtimeCoverage * 100).toFixed(2)} voteField=${(metrics.voteCountFieldPresence * 100).toFixed(2)} votePositive=${(metrics.voteCountPositiveCoverage * 100).toFixed(2)} voteZeroRate=${(metrics.voteCountZeroRate * 100).toFixed(2)} directorCast=${(metrics.directorAndCastTopCoverage * 100).toFixed(2)} reception=${(metrics.receptionCountCoverage * 100).toFixed(2)}`
      : failures.join(' | '),
    failures,
    warnings,
  };
}
