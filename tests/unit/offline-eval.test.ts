import { describe, expect, it } from 'vitest';
import {
  coverageAtK,
  evaluateOffline,
  ndcgAtK,
  noveltyAtK,
  precisionAtK,
} from '@/lib/recommendation/offline-eval';

describe('offline recommendation evaluation metrics', () => {
  it('computes precision@k and ndcg@k', () => {
    const recommended = [10, 20, 30, 40, 50];
    const relevant = new Set([20, 40, 99]);

    expect(precisionAtK(recommended, relevant, 5)).toBe(0.4);
    expect(ndcgAtK(recommended, relevant, 5)).toBeGreaterThan(0);
    expect(ndcgAtK(recommended, relevant, 5)).toBeLessThanOrEqual(1);
  });

  it('computes coverage and novelty', () => {
    const records = [
      { userId: 'u1', recommendedMovieIds: [1, 2, 3, 4, 5], relevantMovieIds: [1, 4] },
      { userId: 'u2', recommendedMovieIds: [3, 4, 5, 6, 7], relevantMovieIds: [3, 6] },
    ];
    const coverage = coverageAtK(records, new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]), 5);
    expect(coverage).toBeGreaterThan(0.7);

    const novelty = noveltyAtK(records, new Map([
      [1, 10], [2, 8], [3, 12], [4, 20], [5, 30], [6, 3], [7, 2],
    ]), 5);
    expect(novelty).toBeGreaterThan(0);
  });

  it('returns aggregate offline summary', () => {
    const summary = evaluateOffline(
      [
        { userId: 'u1', recommendedMovieIds: [1, 2, 3, 4, 5], relevantMovieIds: [1, 3] },
        { userId: 'u2', recommendedMovieIds: [6, 7, 8, 9, 10], relevantMovieIds: [9, 11] },
      ],
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      new Map([
        [1, 4], [2, 5], [3, 6], [4, 7], [5, 8],
        [6, 3], [7, 2], [8, 1], [9, 6], [10, 7],
      ]),
    );
    expect(summary.userCount).toBe(2);
    expect(summary.precisionAt5).toBeGreaterThan(0);
    expect(summary.ndcgAt5).toBeGreaterThan(0);
    expect(summary.coverageAt5).toBeGreaterThan(0);
    expect(summary.noveltyAt5).toBeGreaterThan(0);
  });
});

