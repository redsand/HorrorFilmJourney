import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/recommendations/next/route';

const userFindUniqueMock = vi.fn();
const generateRecommendationBatchMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
  },
}));

vi.mock('@/lib/recommendation/recommendation-engine', () => ({
  generateRecommendationBatch: (...args: unknown[]) => generateRecommendationBatchMock(...args),
}));

describe('POST /api/recommendations/next', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    userFindUniqueMock.mockReset();
    generateRecommendationBatchMock.mockReset();
  });

  it('returns 401 when admin token is missing', async () => {
    const request = new Request('http://localhost/api/recommendations/next', { method: 'POST' });
    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' },
    });
  });

  it('returns 200 with batch and 5 cards', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    generateRecommendationBatchMock.mockResolvedValueOnce({
      batchId: 'batch_1',
      cards: [
        { id: 'i1', rank: 1, movie: { id: 'm1', tmdbId: 1, title: 'A', year: 2001, posterUrl: "https://img/x.jpg", genres: ['horror'], ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } }, ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] }, narrative: { whyImportant: 'a', whatItTeaches: 'b', watchFor: ['w1', 'w2', 'w3'], historicalContext: 'h', reception: {}, castHighlights: [], streaming: [], spoilerPolicy: 'NO_SPOILERS', journeyNode: 'ENGINE_V1_CORE', nextStepHint: 'n', ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } } },
        { id: 'i2', rank: 2, movie: { id: 'm2', tmdbId: 2, title: 'B', year: 2002, posterUrl: "https://img/x.jpg", genres: ['horror'], ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } }, ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] }, narrative: { whyImportant: 'a', whatItTeaches: 'b', watchFor: ['w1', 'w2', 'w3'], historicalContext: 'h', reception: {}, castHighlights: [], streaming: [], spoilerPolicy: 'NO_SPOILERS', journeyNode: 'ENGINE_V1_CORE', nextStepHint: 'n', ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } } },
        { id: 'i3', rank: 3, movie: { id: 'm3', tmdbId: 3, title: 'C', year: 2003, posterUrl: "https://img/x.jpg", genres: ['horror'], ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } }, ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] }, narrative: { whyImportant: 'a', whatItTeaches: 'b', watchFor: ['w1', 'w2', 'w3'], historicalContext: 'h', reception: {}, castHighlights: [], streaming: [], spoilerPolicy: 'NO_SPOILERS', journeyNode: 'ENGINE_V1_CORE', nextStepHint: 'n', ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } } },
        { id: 'i4', rank: 4, movie: { id: 'm4', tmdbId: 4, title: 'D', year: 2004, posterUrl: "https://img/x.jpg", genres: ['horror'], ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } }, ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] }, narrative: { whyImportant: 'a', whatItTeaches: 'b', watchFor: ['w1', 'w2', 'w3'], historicalContext: 'h', reception: {}, castHighlights: [], streaming: [], spoilerPolicy: 'NO_SPOILERS', journeyNode: 'ENGINE_V1_CORE', nextStepHint: 'n', ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } } },
        { id: 'i5', rank: 5, movie: { id: 'm5', tmdbId: 5, title: 'E', year: 2005, posterUrl: "https://img/x.jpg", genres: ['horror'], ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } }, ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] }, narrative: { whyImportant: 'a', whatItTeaches: 'b', watchFor: ['w1', 'w2', 'w3'], historicalContext: 'h', reception: {}, castHighlights: [], streaming: [], spoilerPolicy: 'NO_SPOILERS', journeyNode: 'ENGINE_V1_CORE', nextStepHint: 'n', ratings: { imdb: { value: 7.8, scale: '10' }, additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }] } } },
      ],
    });

    const request = new Request('http://localhost/api/recommendations/next', {
      method: 'POST',
      headers: {
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data.batchId).toBe('batch_1');
    expect(body.data.cards).toHaveLength(5);
    expect(body.data.cards.every((card: { movie: { posterUrl: string } }) => Boolean(card.movie.posterUrl))).toBe(true);
    expect(body.data.cards.every((card: { ratings: { imdb?: unknown; additional: unknown[] } }) => Boolean(card.ratings.imdb))).toBe(true);
    expect(body.data.cards.every((card: { ratings: { additional: unknown[] } }) => card.ratings.additional.length >= 1)).toBe(true);
  });
});
