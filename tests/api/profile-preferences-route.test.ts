import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH } from '@/app/api/profile/preferences/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  profileFindUniqueMock,
  profileUpsertMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  profileFindUniqueMock: vi.fn(),
  profileUpsertMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    userProfile: {
      findUnique: profileFindUniqueMock,
      upsert: profileUpsertMock,
    },
  },
}));

describe('profile preferences route', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    profileFindUniqueMock.mockReset();
    profileUpsertMock.mockReset();
  });

  it('returns default diversity for missing profile', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    profileFindUniqueMock.mockResolvedValueOnce(null);

    const response = await GET(
      new Request('http://localhost/api/profile/preferences', {
        headers: { cookie: makeSessionCookie('user_1') },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        recommendationStyle: 'diversity',
        tolerance: 3,
        pacePreference: 'balanced',
      },
      error: null,
    });
  });

  it('persists popularity preference', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    profileFindUniqueMock.mockResolvedValue({
      tolerance: 3,
      pacePreference: 'balanced',
      horrorDNA: { recommendationStyle: 'diversity', subgenres: ['slasher'] },
    });
    profileUpsertMock.mockResolvedValue({});

    const response = await PATCH(
      new Request('http://localhost/api/profile/preferences', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: makeSessionCookie('user_1'),
        },
        body: JSON.stringify({ recommendationStyle: 'popularity' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(profileUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user_1' },
      update: expect.objectContaining({
        horrorDNA: expect.objectContaining({
          recommendationStyle: 'popularity',
          subgenres: ['slasher'],
        }),
      }),
    }));
  });

  it('returns persisted onboarding values with recommendation style', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    profileFindUniqueMock.mockResolvedValueOnce({
      tolerance: 5,
      pacePreference: 'shock',
      horrorDNA: { recommendationStyle: 'popularity' },
    });

    const response = await GET(
      new Request('http://localhost/api/profile/preferences', {
        headers: { cookie: makeSessionCookie('user_1') },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        recommendationStyle: 'popularity',
        tolerance: 5,
        pacePreference: 'shock',
      },
      error: null,
    });
  });
});
