import { describe, expect, it } from 'vitest';
import { toMovieCardVM, type RecommendationBatchPayload } from '@/adapters/toMovieCardVM';

function buildBatch(overrides: Partial<RecommendationBatchPayload['cards'][number]['narrative']> = {}): RecommendationBatchPayload {
  return {
    batchId: 'batch_1',
    cards: [
      {
        id: 'item_1',
        rank: 1,
        movie: {
          id: 'movie_1',
          tmdbId: 101,
          title: 'Test Movie',
          year: 1999,
          posterUrl: 'https://img/test.jpg',
          genres: ['horror'],
          ratings: {
            imdb: { value: 7.2, scale: '10' },
            additional: [{ source: 'ROTTEN_TOMATOES', value: 82, scale: '100' }],
          },
        },
        ratings: {
          imdb: { value: 7.2, scale: '10' },
          additional: [{ source: 'ROTTEN_TOMATOES', value: 82, scale: '100' }],
        },
        narrative: {
          whyImportant: 'important',
          whatItTeaches: 'teaches',
          watchFor: ['w1', 'w2', 'w3'],
          historicalContext: 'context',
          reception: {},
          castHighlights: [{ name: 'Actor One' }],
          streaming: [],
          spoilerPolicy: 'LIGHT',
          journeyNode: 'NODE_1',
          nextStepHint: 'next',
          ratings: {
            imdb: { value: 7.2, scale: '10' },
            additional: [{ source: 'ROTTEN_TOMATOES', value: 82, scale: '100' }],
          },
          ...overrides,
        },
      },
    ],
  };
}

describe('toMovieCardVM adapter', () => {
  it('maps engine payload to canonical MovieCardVM with required keys', () => {
    const result = toMovieCardVM(buildBatch());
    expect(result).toHaveLength(1);
    expect(result[0]?.movie.posterUrl).toBe('https://img/test.jpg');
    expect(result[0]?.ratings.imdb.value).toBe(7.2);
    expect(result[0]?.ratings.additional.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result[0]?.streaming.offers)).toBe(true);
    expect(Array.isArray(result[0]?.evidence)).toBe(true);
  });

  it('defaults spoilerPolicy to NO_SPOILERS when missing', () => {
    const batch = buildBatch();
    // @ts-expect-error intentional mutation for fallback behavior
    delete batch.cards[0]!.narrative.spoilerPolicy;

    const result = toMovieCardVM(batch);
    expect(result[0]?.codex.spoilerPolicy).toBe('NO_SPOILERS');
  });

  it('normalizes watchFor to exactly 3 strings', () => {
    const result = toMovieCardVM(buildBatch({ watchFor: ['only one'] }));
    expect(result[0]?.codex.watchFor).toHaveLength(3);
    expect(result[0]?.codex.watchFor[0]).toBe('only one');
  });
});
