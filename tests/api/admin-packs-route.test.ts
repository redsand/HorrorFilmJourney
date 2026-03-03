import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as GET_PACKS, PATCH as PATCH_SEASON } from '@/app/api/admin/packs/route';
import { PATCH as PATCH_PACK } from '@/app/api/admin/packs/[id]/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  seasonFindManyMock,
  seasonFindFirstMock,
  seasonUpdateManyMock,
  seasonUpdateMock,
  genrePackFindUniqueMock,
  genrePackCountMock,
  genrePackUpdateMock,
  auditEventCreateMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  seasonFindManyMock: vi.fn(),
  seasonFindFirstMock: vi.fn(),
  seasonUpdateManyMock: vi.fn(),
  seasonUpdateMock: vi.fn(),
  genrePackFindUniqueMock: vi.fn(),
  genrePackCountMock: vi.fn(),
  genrePackUpdateMock: vi.fn(),
  auditEventCreateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
    season: {
      findMany: seasonFindManyMock,
      findFirst: seasonFindFirstMock,
      updateMany: seasonUpdateManyMock,
      update: seasonUpdateMock,
    },
    genrePack: {
      findUnique: genrePackFindUniqueMock,
      count: genrePackCountMock,
      update: genrePackUpdateMock,
    },
    auditEvent: {
      create: auditEventCreateMock,
    },
    $transaction: vi.fn(async (actions: unknown[]) => Promise.all(actions as Promise<unknown>[])),
  },
}));

describe('/api/admin/packs routes', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    seasonFindManyMock.mockReset();
    seasonFindFirstMock.mockReset();
    seasonUpdateManyMock.mockReset();
    seasonUpdateMock.mockReset();
    genrePackFindUniqueMock.mockReset();
    genrePackCountMock.mockReset();
    genrePackUpdateMock.mockReset();
    auditEventCreateMock.mockReset();
    auditEventCreateMock.mockResolvedValue({});
  });

  it('blocks non-admin access', async () => {
    const response = await GET_PACKS(new Request('http://localhost/api/admin/packs', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    }));
    expect(response.status).toBe(403);
  });

  it('lists seasons and packs for admin', async () => {
    seasonFindManyMock.mockResolvedValue([
      {
        id: 'season_1',
        slug: 'season-1',
        name: 'Season 1',
        isActive: true,
        packs: [{ id: 'pack_1', slug: 'horror', name: 'Horror', isEnabled: true, primaryGenre: 'horror', description: null }],
      },
    ]);

    const response = await GET_PACKS(new Request('http://localhost/api/admin/packs', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.activeSeason.slug).toBe('season-1');
    expect(payload.data.seasons).toHaveLength(1);
  });

  it('updates active season', async () => {
    seasonFindFirstMock.mockResolvedValue({ id: 'season_2', slug: 'season-2' });
    seasonUpdateManyMock.mockResolvedValue({ count: 2 });
    seasonUpdateMock.mockResolvedValue({});

    const response = await PATCH_SEASON(new Request('http://localhost/api/admin/packs', {
      method: 'PATCH',
      headers: {
        cookie: makeSessionCookie('admin_1', true),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ seasonSlug: 'season-2' }),
    }));
    expect(response.status).toBe(200);
    expect(auditEventCreateMock).toHaveBeenCalled();
  });

  it('prevents disabling last enabled pack in active season', async () => {
    genrePackFindUniqueMock.mockResolvedValue({
      id: 'pack_1',
      slug: 'horror',
      seasonId: 'season_1',
      isEnabled: true,
      season: { isActive: true },
    });
    genrePackCountMock.mockResolvedValue(1);

    const response = await PATCH_PACK(
      new Request('http://localhost/api/admin/packs/pack_1', {
        method: 'PATCH',
        headers: {
          cookie: makeSessionCookie('admin_1', true),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isEnabled: false }),
      }),
      { params: { id: 'pack_1' } },
    );

    expect(response.status).toBe(400);
  });
});
