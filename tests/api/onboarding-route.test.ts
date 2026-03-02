import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/onboarding/route';

const { userFindUniqueMock, profileFindUniqueMock, profileUpsertMock } = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  profileFindUniqueMock: vi.fn(),
  profileUpsertMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    userProfile: { findUnique: profileFindUniqueMock, upsert: profileUpsertMock },
  },
}));

describe('POST /api/onboarding', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    userFindUniqueMock.mockReset();
    profileFindUniqueMock.mockReset();
    profileUpsertMock.mockReset();
  });

  it('returns 400 when tolerance is invalid', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'test-admin-token',
          'x-user-id': 'user_1',
        },
        body: JSON.stringify({ tolerance: 9, pacePreference: 'balanced' }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 when pacePreference is missing', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'test-admin-token',
          'x-user-id': 'user_1',
        },
        body: JSON.stringify({ tolerance: 4 }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 when pacePreference value is invalid', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'test-admin-token',
          'x-user-id': 'user_1',
        },
        body: JSON.stringify({ tolerance: 4, pacePreference: 'fast' }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('upserts onboarding profile for current user and returns success envelope', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    profileUpsertMock.mockResolvedValueOnce({
      userId: 'user_1',
      onboardingCompleted: true,
    });
    profileFindUniqueMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'test-admin-token',
          'x-user-id': 'user_1',
        },
        body: JSON.stringify({
          tolerance: 4,
          pacePreference: 'balanced',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      data: { success: true },
      error: null,
    });
    expect(profileUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'user_1',
          tolerance: 4,
          pacePreference: 'balanced',
          onboardingCompleted: true,
          horrorDNA: {},
        }),
        update: expect.objectContaining({
          tolerance: 4,
          pacePreference: 'balanced',
          onboardingCompleted: true,
        }),
      }),
    );
  });
});
