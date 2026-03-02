import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/interactions/route';

const userFindUniqueMock = vi.fn();
const movieFindUniqueMock = vi.fn();
const interactionCreateMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    movie: { findUnique: movieFindUniqueMock },
    userMovieInteraction: { create: interactionCreateMock },
  },
}));

describe('POST /api/interactions', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    userFindUniqueMock.mockReset();
    movieFindUniqueMock.mockReset();
    interactionCreateMock.mockReset();
  });

  it('returns 400 when watched interaction has no rating', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({ id: 'movie_1', tmdbId: 1, title: 'Alien' });

    const request = new Request('http://localhost/api/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
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
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
      body: JSON.stringify({ tmdbId: 1, status: 'WATCHED', rating: 5 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: 'interaction_1',
        userId: 'user_1',
        movieId: 'movie_1',
        status: 'WATCHED',
        rating: 5,
        createdAt: '2025-01-01T00:00:00.000Z',
        movie: { tmdbId: 1, title: 'Alien', year: 1979, posterUrl: null },
      },
      error: null,
    });
  });
});
