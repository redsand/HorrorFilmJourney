import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/profile/select-pack/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  genrePackFindFirstMock,
  userProfileUpsertMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  genrePackFindFirstMock: vi.fn(),
  userProfileUpsertMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    genrePack: { findFirst: genrePackFindFirstMock },
    userProfile: { upsert: userProfileUpsertMock },
  },
}));

describe('POST /api/profile/select-pack', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    genrePackFindFirstMock.mockReset();
    userProfileUpsertMock.mockReset();
  });

  it('returns 401 when session is missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/profile/select-pack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packSlug: 'horror' }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects disabled or unavailable pack', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    genrePackFindFirstMock.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/profile/select-pack', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: makeSessionCookie('user_1'),
        },
        body: JSON.stringify({ packSlug: 'thriller' }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('updates selectedPackId for active enabled pack', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    genrePackFindFirstMock.mockResolvedValue({
      id: 'pack_1',
      slug: 'horror',
      season: { slug: 'season-1' },
    });
    userProfileUpsertMock.mockResolvedValue({});

    const response = await POST(
      new Request('http://localhost/api/profile/select-pack', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: makeSessionCookie('user_1'),
        },
        body: JSON.stringify({ packSlug: 'horror' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(userProfileUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user_1' },
      update: expect.objectContaining({ selectedPackId: 'pack_1' }),
      create: expect.objectContaining({ selectedPackId: 'pack_1' }),
    }));
  });
});
