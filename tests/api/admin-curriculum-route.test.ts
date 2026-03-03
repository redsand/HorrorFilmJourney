import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/curriculum/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  seasonFindFirstMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  seasonFindFirstMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    season: { findFirst: seasonFindFirstMock },
  },
}));

describe('GET /api/admin/curriculum', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    seasonFindFirstMock.mockReset();
  });

  it('blocks non-admin users', async () => {
    const response = await GET(
      new Request('http://localhost/api/admin/curriculum', {
        headers: { cookie: makeSessionCookie('user_1', false) },
      }),
    );
    expect(response.status).toBe(403);
  });

  it('returns node coverage for active season', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    seasonFindFirstMock.mockResolvedValue({
      id: 'season_1',
      slug: 'season-1',
      name: 'Season 1',
      packs: [
        {
          id: 'pack_1',
          slug: 'horror',
          name: 'Horror',
          isEnabled: true,
          nodes: [
            {
              id: 'node_1',
              slug: 'foundations',
              name: 'Foundations',
              orderIndex: 1,
              movies: [
                {
                  movie: {
                    id: 'movie_1',
                    tmdbId: 17,
                    title: 'Sample',
                    posterUrl: 'https://img/17.jpg',
                    director: 'Director',
                    castTop: [{ name: 'Lead Actor' }],
                    ratings: [
                      { source: 'IMDB' },
                      { source: 'ROTTEN_TOMATOES' },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const response = await GET(
      new Request('http://localhost/api/admin/curriculum', {
        headers: { cookie: makeSessionCookie('admin_1', true) },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.activeSeason.slug).toBe('season-1');
    expect(payload.data.packs[0].nodes[0]).toMatchObject({
      slug: 'foundations',
      totalTitles: 1,
      eligibleTitles: 1,
    });
    expect(payload.data.packs[0].nodes[0].titles[0]).toMatchObject({
      tmdbId: 17,
      title: 'Sample',
      isEligible: true,
    });
  });
});
