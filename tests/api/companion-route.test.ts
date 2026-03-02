import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/companion/route';

const userFindUniqueMock = vi.fn();
const movieFindUniqueMock = vi.fn();
const evidenceFindManyMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    movie: { findUnique: movieFindUniqueMock },
    evidencePacket: { findMany: evidenceFindManyMock },
  },
}));

describe('GET /api/companion', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    userFindUniqueMock.mockReset();
    movieFindUniqueMock.mockReset();
    evidenceFindManyMock.mockReset();
  });

  it('returns 400 when tmdbId is missing', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });

    const request = new Request('http://localhost/api/companion', {
      headers: {
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'tmdbId is required and must be an integer' },
    });
  });

  it('returns required companion keys with stable envelope', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
    });
    evidenceFindManyMock.mockResolvedValueOnce([
      {
        sourceName: 'Source A',
        url: 'https://example.com/a',
        snippet: 'Snippet A',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS', {
      headers: {
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data.movie).toEqual({
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
    });
    expect(body.data.credits).toEqual({ cast: [] });
    expect(Array.isArray(body.data.sections.productionNotes)).toBe(true);
    expect(Array.isArray(body.data.sections.historicalNotes)).toBe(true);
    expect(Array.isArray(body.data.sections.receptionNotes)).toBe(true);
    expect(Array.isArray(body.data.sections.trivia)).toBe(true);
    expect(body.data.spoilerPolicy).toBe('NO_SPOILERS');
    expect(Array.isArray(body.data.evidence)).toBe(true);
  });

  it('changes content by spoilerPolicy', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValue({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
    });
    evidenceFindManyMock.mockResolvedValue([]);

    const noSpoilersResponse = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS', {
        headers: {
          'x-admin-token': 'test-admin-token',
          'x-user-id': 'user_1',
        },
      }),
    );

    const fullResponse = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=FULL', {
        headers: {
          'x-admin-token': 'test-admin-token',
          'x-user-id': 'user_1',
        },
      }),
    );

    const noSpoilers = await noSpoilersResponse.json();
    const full = await fullResponse.json();

    expect(noSpoilers.data.sections.productionNotes).not.toEqual(full.data.sections.productionNotes);
    expect(full.data.sections.productionNotes.some((line: string) => line.includes('Full mode'))).toBe(true);
  });
});
