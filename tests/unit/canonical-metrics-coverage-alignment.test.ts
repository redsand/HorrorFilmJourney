import { describe, expect, it } from 'vitest';
import { computeCoverageGateMetrics, type CoverageMovieInput } from '@/lib/verification/catalog-coverage-gate';
import { computeCanonicalRuntimeVoteCoverage } from '@/lib/movie/canonical-metrics';
import { computeVoteCountCoverageBreakdown } from '@/lib/metrics/catalog-coverage';

describe('canonical runtime/vote coverage alignment', () => {
  it('matches coverage-gate runtime/voteCount metrics using canonical DB fields', () => {
    const movies: CoverageMovieInput[] = [
      {
        tmdbId: 1,
        director: 'A',
        castTop: [{ name: 'X' }],
        ratings: [
          { source: 'TMDB_RUNTIME', value: 100 },
          { source: 'TMDB_VOTE_COUNT', value: 1200 },
        ],
      },
      {
        tmdbId: 2,
        director: 'B',
        castTop: [{ name: 'Y' }],
        ratings: [
          { source: 'TMDB_RUNTIME', value: 0 },
          { source: 'TMDB_VOTE_COUNT', value: 450 },
        ],
      },
      {
        tmdbId: 3,
        director: 'C',
        castTop: [{ name: 'Z' }],
        ratings: [
          { source: 'TMDB_RUNTIME', value: 95 },
          { source: 'TMDB_VOTE_COUNT', value: 0 },
        ],
      },
      {
        tmdbId: 4,
        director: 'D',
        castTop: [{ name: 'Q' }],
        ratings: [],
      },
    ];

    const gate = computeCoverageGateMetrics(movies, 10);
    const canonical = computeCanonicalRuntimeVoteCoverage(
      movies.map((movie) => ({ tmdbId: movie.tmdbId, ratings: movie.ratings })),
    );

    expect(gate.runtimeCoverage).toBe(canonical.runtimeCoverage);
    const voteCoverage = computeVoteCountCoverageBreakdown(
      movies.map((movie) => ({ tmdbId: movie.tmdbId, ratings: movie.ratings })),
    );
    expect(gate.voteCountFieldPresence).toBe(voteCoverage.voteCountFieldPresence);
    expect(gate.voteCountPositiveCoverage).toBe(voteCoverage.voteCountPositiveCoverage);
    expect(gate.voteCountZeroRate).toBe(voteCoverage.voteCountZeroRate);
    expect(gate.sampleIds.missingRuntime).toEqual(canonical.missingRuntimeIds.slice(0, 10));
    expect(gate.sampleIds.missingVoteCountField).toEqual(voteCoverage.nullTmdbIds.slice(0, 10));
    expect(gate.sampleIds.zeroVoteCount).toEqual(voteCoverage.zeroTmdbIds.slice(0, 10));
  });
});
