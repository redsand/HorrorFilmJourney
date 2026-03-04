import { describe, expect, it } from 'vitest';
import {
  computeCoverageGateMetrics,
  evaluateCoverageGate,
  type CoverageGateThresholds,
} from '@/lib/verification/catalog-coverage-gate';

const thresholds: CoverageGateThresholds = {
  runtimeCoverageMin: 0.9,
  voteCountCoverageMin: 0.9,
  directorAndCastTopCoverageMin: 0.85,
  receptionCountCoverageMin: 0.8,
  sampleSize: 3,
};

describe('catalog coverage gate', () => {
  it('passes when all coverage thresholds are met', () => {
    const movies = Array.from({ length: 10 }, (_, idx) => ({
      tmdbId: 1000 + idx,
      director: 'Director',
      castTop: [{ name: 'Actor' }],
      ratings: [
        { source: 'TMDB_RUNTIME', value: 100 },
        { source: 'TMDB_VOTE_COUNT', value: 1000 },
        { source: 'TMDB', value: 7.1 },
        { source: 'IMDB', value: 7.0 },
      ],
    }));
    const metrics = computeCoverageGateMetrics(movies, thresholds.sampleSize);
    const gate = evaluateCoverageGate(metrics, thresholds);
    expect(gate.pass).toBe(true);
  });

  it('fails with actionable reasons and sample TMDB ids', () => {
    const movies = [
      {
        tmdbId: 1,
        director: null,
        castTop: [],
        ratings: [{ source: 'TMDB', value: 7.2 }],
      },
      {
        tmdbId: 2,
        director: null,
        castTop: [],
        ratings: [{ source: 'TMDB', value: 6.9 }],
      },
      {
        tmdbId: 3,
        director: null,
        castTop: [],
        ratings: [{ source: 'TMDB', value: 6.8 }],
      },
      {
        tmdbId: 4,
        director: null,
        castTop: [],
        ratings: [{ source: 'TMDB', value: 7.5 }],
      },
    ];
    const metrics = computeCoverageGateMetrics(movies, thresholds.sampleSize);
    const gate = evaluateCoverageGate(metrics, thresholds);
    expect(gate.pass).toBe(false);
    expect(gate.details).toContain('runtimeCoverage');
    expect(gate.details).toContain('voteCountCoverage');
    expect(gate.details).toContain('directorAndCastTopCoverage');
    expect(gate.details).toContain('sampleTmdbIds=[1,2,3]');
  });
});

