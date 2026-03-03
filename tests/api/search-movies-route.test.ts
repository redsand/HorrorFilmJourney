import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/search/movies/route';

const {
  requireAuthMock,
  resolveEffectivePackForUserMock,
  movieFindManyMock,
  interactionFindManyMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  resolveEffectivePackForUserMock: vi.fn(),
  movieFindManyMock: vi.fn(),
  interactionFindManyMock: vi.fn(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireAuth: requireAuthMock,
}));

vi.mock('@/lib/packs/pack-resolver', () => ({
  resolveEffectivePackForUser: resolveEffectivePackForUserMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    movie: {
      findMany: movieFindManyMock,
    },
    userMovieInteraction: {
      findMany: interactionFindManyMock,
    },
  },
}));

describe('GET /api/search/movies', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    resolveEffectivePackForUserMock.mockReset();
    movieFindManyMock.mockReset();
    interactionFindManyMock.mockReset();
  });

  it('returns 401 when auth fails', async () => {
    requireAuthMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });

    const response = await GET(new Request('http://localhost/api/search/movies?q=the'));
    expect(response.status).toBe(401);
  });

  it('returns season-scoped results and watchlist flag', async () => {
    requireAuthMock.mockResolvedValue({ ok: true, userId: 'user_1', isAdmin: false });
    resolveEffectivePackForUserMock.mockResolvedValue({
      packSlug: 'horror',
      primaryGenre: 'horror',
      packId: 'pack_1',
      seasonSlug: 'season-1',
    });
    movieFindManyMock.mockResolvedValue([
      {
        id: 'movie_1',
        tmdbId: 11,
        title: 'The Haunting',
        year: 1963,
        posterUrl: 'https://image.tmdb.org/t/p/w500/a.jpg',
        genres: ['horror', 'mystery'],
        nodeAssignments: [{ node: { packId: 'pack_1' } }],
      },
      {
        id: 'movie_2',
        tmdbId: 12,
        title: 'The Space Between',
        year: 2009,
        posterUrl: 'https://image.tmdb.org/t/p/w500/b.jpg',
        genres: ['scifi'],
        nodeAssignments: [{ node: { packId: 'pack_scifi' } }],
      },
    ]);
    interactionFindManyMock.mockResolvedValue([{ movieId: 'movie_1' }]);

    const response = await GET(new Request('http://localhost/api/search/movies?q=the&limit=10'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data.packSlug).toBe('horror');
    expect(body.data.items).toEqual([
      {
        tmdbId: 11,
        title: 'The Haunting',
        year: 1963,
        posterUrl: 'https://image.tmdb.org/t/p/w500/a.jpg',
        inWatchlist: true,
      },
    ]);
  });
});
