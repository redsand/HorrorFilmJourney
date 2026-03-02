import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/movies/upsert/route';

const { userFindUniqueMock, movieUpsertMock, movieRatingUpsertMock } = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  movieUpsertMock: vi.fn(),
  movieRatingUpsertMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    movie: { upsert: movieUpsertMock },
    movieRating: { upsert: movieRatingUpsertMock },
  },
}));

describe('POST /api/movies/upsert', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    userFindUniqueMock.mockReset();
    movieUpsertMock.mockReset();
    movieRatingUpsertMock.mockReset();
  });

  it('requires posterUrl', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });

    const request = new Request('http://localhost/api/movies/upsert', {
      method: 'POST',
      body: JSON.stringify({ tmdbId: 1, title: 'Alien' }),
      headers: {
        'content-type': 'application/json',
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('stores normalized ratings and upserts duplicate sources', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    movieUpsertMock.mockResolvedValue({
      id: 'movie_1',
      tmdbId: 1,
      title: 'Alien',
      year: 1979,
      posterUrl: 'https://img/1.jpg',
      genres: ['horror'],
      ratings: [],
    });
    movieRatingUpsertMock.mockResolvedValue({});

    const request = new Request('http://localhost/api/movies/upsert', {
      method: 'POST',
      body: JSON.stringify({
        tmdbId: 1,
        title: 'Alien',
        posterUrl: 'https://img/1.jpg',
        ratings: [
          { source: 'IMDB', rawValue: '7.8/10' },
          { source: 'IMDB', rawValue: '8.0/10' },
          { source: 'ROTTEN_TOMATOES', rawValue: '92%' },
        ],
      }),
      headers: {
        'content-type': 'application/json',
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(movieRatingUpsertMock).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid rating source', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });

    const request = new Request('http://localhost/api/movies/upsert', {
      method: 'POST',
      body: JSON.stringify({
        tmdbId: 1,
        title: 'Alien',
        posterUrl: 'https://img/1.jpg',
        ratings: [{ source: 'LETTERBOXD', rawValue: '4.0/5' }],
      }),
      headers: {
        'content-type': 'application/json',
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
