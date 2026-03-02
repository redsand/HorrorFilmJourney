import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/movies/upsert/route';

const userFindUniqueMock = vi.fn();
const movieUpsertMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    movie: { upsert: movieUpsertMock },
  },
}));

describe('POST /api/movies/upsert', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    userFindUniqueMock.mockReset();
    movieUpsertMock.mockReset();
  });

  it('returns 401 when admin token is missing', async () => {
    const request = new Request('http://localhost/api/movies/upsert', {
      method: 'POST',
      body: JSON.stringify({ tmdbId: 1, title: 'Alien' }),
      headers: { 'content-type': 'application/json', 'x-user-id': 'user_1' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 when X-User-Id is missing', async () => {
    const request = new Request('http://localhost/api/movies/upsert', {
      method: 'POST',
      body: JSON.stringify({ tmdbId: 1, title: 'Alien' }),
      headers: { 'content-type': 'application/json', 'x-admin-token': 'test-admin-token' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' },
    });
  });

  it('returns 400 for invalid body', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });

    const request = new Request('http://localhost/api/movies/upsert', {
      method: 'POST',
      body: JSON.stringify({ tmdbId: 'bad' }),
      headers: {
        'content-type': 'application/json',
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 200 envelope with movie', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieUpsertMock.mockResolvedValueOnce({
      id: 'movie_1',
      tmdbId: 1,
      title: 'Alien',
      year: 1979,
      posterUrl: null,
      genres: ['horror', 'sci-fi'],
    });

    const request = new Request('http://localhost/api/movies/upsert', {
      method: 'POST',
      body: JSON.stringify({ tmdbId: 1, title: 'Alien', year: 1979, genres: ['horror', 'sci-fi'] }),
      headers: {
        'content-type': 'application/json',
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: 'movie_1',
        tmdbId: 1,
        title: 'Alien',
        year: 1979,
        posterUrl: null,
        genres: ['horror', 'sci-fi'],
      },
      error: null,
    });
  });
});
