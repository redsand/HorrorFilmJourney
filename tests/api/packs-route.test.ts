import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/packs/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const { userFindUniqueMock } = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
  },
}));

describe('/api/packs route', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
  });

  it('returns Season 1 Horror shape for authenticated user', async () => {
    const request = new Request('http://localhost/api/packs', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        activeSeason: {
          slug: 'season-1',
          name: 'Season 1',
        },
        packs: [
          {
            slug: 'horror',
            name: 'Horror',
            isEnabled: true,
            seasonSlug: 'season-1',
          },
        ],
      },
      error: null,
    });
  });
});

