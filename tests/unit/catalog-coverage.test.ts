import { describe, expect, it } from 'vitest';
import {
  computeVoteCountCoverageBreakdown,
  computeVoteCountFieldPresence,
  computeVoteCountPositiveCoverage,
} from '@/lib/metrics/catalog-coverage';

describe('catalog coverage vote metrics', () => {
  it('splits null vs zero vs positive vote counts', () => {
    const movies = [
      { tmdbId: 1, ratings: [{ source: 'TMDB_VOTE_COUNT', value: 120 }] },
      { tmdbId: 2, ratings: [{ source: 'TMDB_VOTE_COUNT', value: 0 }] },
      { tmdbId: 3, ratings: [{ source: 'TMDB', value: 7.2 }] },
      { tmdbId: 4, ratings: [] },
    ];

    const metrics = computeVoteCountCoverageBreakdown(movies);
    expect(metrics.totalTmdbMovies).toBe(4);
    expect(metrics.voteCountFieldPresent).toBe(2);
    expect(metrics.voteCountPositive).toBe(1);
    expect(metrics.voteCountZero).toBe(1);
    expect(metrics.voteCountNull).toBe(2);
    expect(metrics.voteCountFieldPresence).toBe(0.5);
    expect(metrics.voteCountPositiveCoverage).toBe(0.25);
    expect(metrics.voteCountZeroRate).toBe(0.25);
    expect(metrics.voteCountNullRate).toBe(0.5);
    expect(metrics.zeroTmdbIds).toEqual([2]);
    expect(metrics.nullTmdbIds).toEqual([3, 4]);
  });

  it('exposes convenience helpers', () => {
    const movies = [
      { tmdbId: 10, ratings: [{ source: 'TMDB_VOTE_COUNT', value: 0 }] },
      { tmdbId: 11, ratings: [{ source: 'TMDB_VOTE_COUNT', value: 1 }] },
    ];
    expect(computeVoteCountFieldPresence(movies)).toBe(1);
    expect(computeVoteCountPositiveCoverage(movies)).toBe(0.5);
  });
});

