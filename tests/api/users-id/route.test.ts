import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/users/[id]/route';
import { makeSessionCookie } from '../../helpers/session-cookie';

const { findUniqueMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
    },
  },
}));

describe('/api/users/[id] route', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it('returns 401 when admin session is missing', async () => {
    const request = new Request('http://localhost/api/users/user_1');
    const response = await GET(request, { params: { id: 'user_1' } });

    expect(response.status).toBe(401);
  });

  it('returns user with profile summary', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'user_1',
      displayName: 'Ripley',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      profile: {
        tolerance: 4,
        pacePreference: 'balanced',
      },
    });

    const request = new Request('http://localhost/api/users/user_1', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    });
    const response = await GET(request, { params: { id: 'user_1' } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: 'user_1',
        displayName: 'Ripley',
        createdAt: '2025-01-01T00:00:00.000Z',
        profile: {
          tolerance: 4,
          pacePreference: 'balanced',
        },
      },
      error: null,
    });
  });
});
