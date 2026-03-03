import { describe, expect, it } from 'vitest';
import {
  isRecommendationEligibleMovie,
  MIN_RATING_SOURCES_FOR_ELIGIBILITY,
} from '@/lib/recommendation/recommendation-engine-v1';

describe('recommendation eligibility rule', () => {
  it('requires posterUrl, IMDB source, and minimum total rating sources', () => {
    expect(
      isRecommendationEligibleMovie({
        posterUrl: 'https://img/1.jpg',
        ratings: [{ source: 'IMDB' }, { source: 'ROTTEN_TOMATOES' }],
      }),
    ).toBe(false);

    expect(
      isRecommendationEligibleMovie({
        posterUrl: 'https://img/1.jpg',
        ratings: [
          { source: 'ROTTEN_TOMATOES' },
          { source: 'METACRITIC' },
          { source: 'TMDB' },
        ],
      }),
    ).toBe(false);

    // In test mode, /api/posters fallback is allowed for deterministic seeded catalogs.
    expect(
      isRecommendationEligibleMovie({
        posterUrl: '/api/posters/123',
        ratings: [
          { source: 'IMDB' },
          { source: 'ROTTEN_TOMATOES' },
          { source: 'METACRITIC' },
        ],
      }),
    ).toBe(true);

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        isRecommendationEligibleMovie({
          posterUrl: '/api/posters/123',
          ratings: [
            { source: 'IMDB' },
            { source: 'ROTTEN_TOMATOES' },
            { source: 'METACRITIC' },
          ],
        }),
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }

    expect(
      isRecommendationEligibleMovie({
        posterUrl: 'https://img/1.jpg',
        ratings: [
          { source: 'IMDB' },
          { source: 'ROTTEN_TOMATOES' },
          { source: 'METACRITIC' },
        ],
      }),
    ).toBe(true);

    expect(MIN_RATING_SOURCES_FOR_ELIGIBILITY).toBe(3);
  });
});
