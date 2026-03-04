import { describe, expect, it } from 'vitest';
import { normalizeMovieSignals } from '@/lib/movie/normalized-signals';

describe('normalizeMovieSignals', () => {
  it('normalizes all provided values deterministically', () => {
    const result = normalizeMovieSignals({
      voteCount: 999,
      rating: 7.5,
      popularity: 80,
      runtimeMinutes: 100,
      ratingsConfidence: 0.9,
      metadataCompleteness: 0.8,
    });

    expect(result).toEqual({
      voteCount: 3,
      rating: 0.75,
      popularity: 0.8,
      runtime: 0.833333,
      ratingsConfidence: 0.9,
      metadataCompleteness: 0.8,
      confidenceScore: 0.7525,
    });
  });

  it('uses fallback handling for missing values', () => {
    const result = normalizeMovieSignals({
      voteCount: null,
      rating: null,
      popularity: 40,
      runtimeMinutes: undefined,
    });

    expect(result.voteCount).toBe(0);
    expect(result.rating).toBe(0);
    expect(result.popularity).toBe(0.4);
    expect(result.runtime).toBe(0);
    expect(result.ratingsConfidence).toBe(0);
    expect(result.metadataCompleteness).toBe(0.25);
    expect(result.confidenceScore).toBe(0.05);
  });

  it('clamps out-of-range and invalid values', () => {
    const result = normalizeMovieSignals({
      voteCount: -10,
      rating: 15,
      popularity: 150,
      runtimeMinutes: 600,
      ratingsConfidence: 3,
      metadataCompleteness: -5,
    });

    expect(result.voteCount).toBe(0);
    expect(result.rating).toBe(1);
    expect(result.popularity).toBe(1);
    expect(result.runtime).toBe(1);
    expect(result.ratingsConfidence).toBe(1);
    expect(result.metadataCompleteness).toBe(0);
    expect(result.confidenceScore).toBe(0.5);
  });
});
