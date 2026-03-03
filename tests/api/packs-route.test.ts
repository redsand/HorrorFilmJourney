import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/packs/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  seasonUpsertMock,
  genrePackUpsertMock,
  seasonFindFirstMock,
  genrePackFindManyMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  seasonUpsertMock: vi.fn(),
  genrePackUpsertMock: vi.fn(),
  seasonFindFirstMock: vi.fn(),
  genrePackFindManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
    season: {
      upsert: seasonUpsertMock,
      findFirst: seasonFindFirstMock,
    },
    genrePack: {
      upsert: genrePackUpsertMock,
      findMany: genrePackFindManyMock,
    },
  },
}));

describe('/api/packs route', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    seasonUpsertMock.mockReset();
    genrePackUpsertMock.mockReset();
    seasonFindFirstMock.mockReset();
    genrePackFindManyMock.mockReset();
    delete process.env.SEASONS_PACKS_ENABLED;
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    seasonUpsertMock.mockResolvedValue({ id: 'season_1', slug: 'season-1' });
    genrePackUpsertMock.mockResolvedValue({
      id: 'pack_horror',
      slug: 'horror',
      primaryGenre: 'horror',
      season: { slug: 'season-1' },
    });
  });

  it('does not expose disabled inactive-season cult pack', async () => {
    process.env.SEASONS_PACKS_ENABLED = 'true';
    seasonFindFirstMock.mockResolvedValue({ slug: 'season-1', name: 'Season 1' });
    genrePackFindManyMock.mockResolvedValue([
      {
        slug: 'horror',
        name: 'Horror',
        isEnabled: true,
        season: { slug: 'season-1', name: 'Season 1' },
      },
    ]);

    const request = new Request('http://localhost/api/packs', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.packs).toHaveLength(1);
    expect(body.data.packs[0]).toMatchObject({
      slug: 'horror',
      isEnabled: true,
    });
    expect(body.data.packs.find((pack: { slug: string }) => pack.slug === 'cult-classics')).toBeUndefined();
  });

  it('shows cult classics when season is active and pack is enabled', async () => {
    process.env.SEASONS_PACKS_ENABLED = 'true';
    seasonFindFirstMock.mockResolvedValue({ slug: 'season-2', name: 'Season 2' });
    genrePackFindManyMock.mockResolvedValue([
      {
        slug: 'cult-classics',
        name: 'Cult Classics',
        isEnabled: true,
        season: { slug: 'season-2', name: 'Season 2' },
      },
    ]);

    const request = new Request('http://localhost/api/packs', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        activeSeason: {
          slug: 'season-2',
          name: 'Season 2',
        },
        packs: [
          {
            slug: 'cult-classics',
            name: 'Cult Classics',
            isEnabled: true,
            seasonSlug: 'season-2',
            seasonLabel: 'Season 2',
            themeKey: 'cult',
          },
        ],
      },
      error: null,
    });
  });
});
