import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/curriculum/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  seasonFindManyMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  seasonFindManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    season: { findMany: seasonFindManyMock },
  },
}));

describe('GET /api/admin/curriculum', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    seasonFindManyMock.mockReset();
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
    seasonFindManyMock.mockResolvedValue([
      {
        id: 'season_1',
        slug: 'season-1',
        name: 'Season 1',
        isActive: true,
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
                    rank: 1,
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
                      streamingCache: [{ id: 'stream_1' }],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'season_2',
        slug: 'season-2',
        name: 'Season 2',
        isActive: false,
        packs: [
          {
            id: 'pack_2',
            slug: 'cult-classics',
            name: 'Cult Classics',
            isEnabled: false,
            nodes: [],
          },
        ],
      },
    ]);

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
      eligibilityCoverage: 100,
      missingStreamingCount: 0,
    });
    expect(payload.data.packs[0].nodes[0].titles[0]).toMatchObject({
      tmdbId: 17,
      title: 'Sample',
      isEligible: true,
    });
    expect(payload.data.seasons).toHaveLength(2);
    expect(payload.data.seasons[1]).toMatchObject({
      slug: 'season-2',
      isActive: false,
    });
  });
});
