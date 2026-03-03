import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/interactions/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  movieFindUniqueMock,
  interactionCreateMock,
  recommendationItemFindUniqueMock,
  interactionCountMock,
  interactionDeleteManyMock,
  generateRecommendationBatchMock,
  computeTasteProfileMock,
  trackWatchedMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  movieFindUniqueMock: vi.fn(),
  interactionCreateMock: vi.fn(),
  recommendationItemFindUniqueMock: vi.fn(),
  interactionCountMock: vi.fn(),
  interactionDeleteManyMock: vi.fn(),
  generateRecommendationBatchMock: vi.fn(),
  computeTasteProfileMock: vi.fn(),
  trackWatchedMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    movie: { findUnique: movieFindUniqueMock },
    recommendationItem: { findUnique: recommendationItemFindUniqueMock },
    userMovieInteraction: { create: interactionCreateMock, count: interactionCountMock, deleteMany: interactionDeleteManyMock },
  },
}));

vi.mock('@/lib/recommendation/recommendation-engine', () => ({
  generateRecommendationBatch: (...args: unknown[]) => generateRecommendationBatchMock(...args),
}));

vi.mock('@/lib/taste/taste-computation-service', () => ({
  TasteComputationService: class {
    computeTasteProfile(userId: string) {
      return computeTasteProfileMock(userId);
    }
  },
}));

vi.mock('@/lib/journey/journey-progression-service', () => ({
  JourneyProgressionService: class {
    trackWatched(input: unknown) {
      return trackWatchedMock(input);
    }
  },
}));

describe('POST /api/interactions', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    movieFindUniqueMock.mockReset();
    interactionCreateMock.mockReset();
    recommendationItemFindUniqueMock.mockReset();
    interactionCountMock.mockReset();
    interactionDeleteManyMock.mockReset();
    generateRecommendationBatchMock.mockReset();
    computeTasteProfileMock.mockReset();
    trackWatchedMock.mockReset();
  });

  it('returns 400 when watched interaction has no rating', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({ id: 'movie_1', tmdbId: 1, title: 'Alien' });

    const request = new Request('http://localhost/api/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1'),
      },
      body: JSON.stringify({ tmdbId: 1, status: 'WATCHED' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'rating is required for WATCHED and ALREADY_SEEN',
      },
    });
  });

  it('returns 200 envelope for valid interaction', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({ id: 'movie_1', tmdbId: 1, title: 'Alien' });
    interactionCreateMock.mockResolvedValueOnce({
      id: 'interaction_1',
      userId: 'user_1',
      movieId: 'movie_1',
      status: 'WATCHED',
      rating: 5,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      movie: { tmdbId: 1, title: 'Alien', year: 1979, posterUrl: null },
    });

    const request = new Request('http://localhost/api/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1'),
      },
      body: JSON.stringify({ tmdbId: 1, status: 'WATCHED', rating: 5 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        interaction: {
          id: 'interaction_1',
          userId: 'user_1',
          movieId: 'movie_1',
          status: 'WATCHED',
          rating: 5,
          createdAt: '2025-01-01T00:00:00.000Z',
          movie: { tmdbId: 1, title: 'Alien', year: 1979, posterUrl: null },
        },
      },
      error: null,
    });
    expect(computeTasteProfileMock).toHaveBeenCalledWith('user_1');
    expect(trackWatchedMock).toHaveBeenCalledTimes(1);
    expect(interactionDeleteManyMock).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        movieId: 'movie_1',
        status: 'WANT_TO_WATCH',
        id: { not: 'interaction_1' },
      },
    });
  });

  it('returns nextBatch on third ALREADY_SEEN interaction for current batch', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValue({ id: 'movie_1', tmdbId: 1, title: 'Alien' });
    recommendationItemFindUniqueMock.mockResolvedValue({ batchId: 'batch_1' });

    interactionCreateMock
      .mockResolvedValueOnce({ id: 'i1', userId: 'user_1', movieId: 'movie_1', status: 'ALREADY_SEEN', rating: 5, createdAt: new Date('2025-01-01T00:00:00.000Z'), movie: { tmdbId: 1, title: 'Alien', year: 1979, posterUrl: null } })
      .mockResolvedValueOnce({ id: 'i2', userId: 'user_1', movieId: 'movie_1', status: 'ALREADY_SEEN', rating: 4, createdAt: new Date('2025-01-01T00:01:00.000Z'), movie: { tmdbId: 1, title: 'Alien', year: 1979, posterUrl: null } })
      .mockResolvedValueOnce({ id: 'i3', userId: 'user_1', movieId: 'movie_1', status: 'ALREADY_SEEN', rating: 3, createdAt: new Date('2025-01-01T00:02:00.000Z'), movie: { tmdbId: 1, title: 'Alien', year: 1979, posterUrl: null } });

    interactionCountMock.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    generateRecommendationBatchMock.mockResolvedValueOnce({ batchId: 'batch_2', cards: [{ id: 'ri1', rank: 1, movie: { id: 'm2', tmdbId: 2, title: 'The Thing', year: 1982, posterUrl: null, genres: ['horror'] }, narrative: { whyImportant: 'x', whatItTeaches: 'y', watchFor: ['a', 'b', 'c'], historicalContext: 'z', reception: {}, castHighlights: [], streaming: [], spoilerPolicy: 'NO_SPOILERS', journeyNode: 'ENGINE_V1_CORE', nextStepHint: 'n' } }] });

    const makeRequest = () =>
      POST(
        new Request('http://localhost/api/interactions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: makeSessionCookie('user_1'),
          },
          body: JSON.stringify({ tmdbId: 1, status: 'ALREADY_SEEN', rating: 5, recommendationItemId: 'rec_item_1' }),
        }),
      );

    const response1 = await makeRequest();
    const body1 = await response1.json();
    expect(body1.data.nextBatch).toBeUndefined();

    const response2 = await makeRequest();
    const body2 = await response2.json();
    expect(body2.data.nextBatch).toBeUndefined();

    const response3 = await makeRequest();
    const body3 = await response3.json();
    expect(body3.data.nextBatch?.batchId).toBe('batch_2');
    expect(generateRecommendationBatchMock).toHaveBeenCalledTimes(1);
    expect(computeTasteProfileMock).toHaveBeenCalledTimes(3);
    expect(trackWatchedMock).not.toHaveBeenCalled();
    expect(interactionDeleteManyMock).toHaveBeenCalledTimes(3);
  });

  it('does not recompute taste profile for SKIPPED interactions', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({ id: 'movie_1', tmdbId: 1, title: 'Alien' });
    interactionCreateMock.mockResolvedValueOnce({
      id: 'interaction_2',
      userId: 'user_1',
      movieId: 'movie_1',
      status: 'SKIPPED',
      rating: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      movie: { tmdbId: 1, title: 'Alien', year: 1979, posterUrl: null },
    });

    const response = await POST(new Request('http://localhost/api/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1'),
      },
      body: JSON.stringify({ tmdbId: 1, status: 'SKIPPED' }),
    }));

    expect(response.status).toBe(200);
    expect(computeTasteProfileMock).not.toHaveBeenCalled();
    expect(trackWatchedMock).not.toHaveBeenCalled();
    expect(interactionDeleteManyMock).toHaveBeenCalledTimes(1);
  });

  it('does not remove watchlist rows when status is WANT_TO_WATCH', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({ id: 'movie_1', tmdbId: 1, title: 'Alien' });
    interactionCreateMock.mockResolvedValueOnce({
      id: 'interaction_watchlist',
      userId: 'user_1',
      movieId: 'movie_1',
      status: 'WANT_TO_WATCH',
      rating: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      movie: { tmdbId: 1, title: 'Alien', year: 1979, posterUrl: null },
    });

    const response = await POST(new Request('http://localhost/api/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1'),
      },
      body: JSON.stringify({ tmdbId: 1, status: 'WANT_TO_WATCH' }),
    }));

    expect(response.status).toBe(200);
    expect(interactionDeleteManyMock).not.toHaveBeenCalled();
  });
});
