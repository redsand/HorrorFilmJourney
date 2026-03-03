import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/watchlist/route';

const {
  requireAuthMock,
  resolveEffectivePackForUserMock,
  watchlistFindManyMock,
  allRecentFindManyMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  resolveEffectivePackForUserMock: vi.fn(),
  watchlistFindManyMock: vi.fn(),
  allRecentFindManyMock: vi.fn(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireAuth: requireAuthMock,
}));

vi.mock('@/lib/packs/pack-resolver', () => ({
  resolveEffectivePackForUser: resolveEffectivePackForUserMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userMovieInteraction: {
      findMany: vi.fn(async (args: { where: { status?: string } }) => {
        if (args.where.status) {
          return watchlistFindManyMock(args);
        }
        return allRecentFindManyMock(args);
      }),
    },
  },
}));

describe('GET /api/watchlist', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    resolveEffectivePackForUserMock.mockReset();
    watchlistFindManyMock.mockReset();
    allRecentFindManyMock.mockReset();
  });

  it('returns 401 when auth fails', async () => {
    requireAuthMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    const response = await GET(new Request('http://localhost/api/watchlist'));
    expect(response.status).toBe(401);
  });

  it('returns paginated watchlist and excludes movies whose latest status is not WANT_TO_WATCH', async () => {
    requireAuthMock.mockResolvedValue({ ok: true, userId: 'user_1', isAdmin: false });
    resolveEffectivePackForUserMock.mockResolvedValue({
      packSlug: 'horror',
      primaryGenre: 'horror',
      packId: 'pack_1',
      seasonSlug: 'season-1',
    });
    watchlistFindManyMock.mockResolvedValue([
      {
        id: 'i1',
        movieId: 'm1',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        movie: {
          id: 'm1',
          tmdbId: 100,
          title: 'Movie One',
          year: 2001,
          posterUrl: 'https://image.tmdb.org/t/p/w500/one.jpg',
          genres: ['horror'],
          nodeAssignments: [{ node: { packId: 'pack_1' } }],
        },
      },
      {
        id: 'i2',
        movieId: 'm2',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
        movie: {
          id: 'm2',
          tmdbId: 101,
          title: 'Movie Two',
          year: 2002,
          posterUrl: 'https://image.tmdb.org/t/p/w500/two.jpg',
          genres: ['horror'],
          nodeAssignments: [{ node: { packId: 'pack_1' } }],
        },
      },
    ]);
    allRecentFindManyMock.mockResolvedValue([
      { movieId: 'm2', status: 'WATCHED' },
      { movieId: 'm1', status: 'WANT_TO_WATCH' },
    ]);

    const response = await GET(new Request('http://localhost/api/watchlist?page=1&pageSize=5'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].movie.tmdbId).toBe(100);
    expect(body.data.total).toBe(1);
    expect(body.data.page).toBe(1);
    expect(body.data.totalPages).toBe(1);
  });
});

