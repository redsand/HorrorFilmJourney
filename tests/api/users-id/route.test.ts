import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/users/[id]/route';

const findUniqueMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
    },
  },
}));

describe('/api/users/[id] route', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    findUniqueMock.mockReset();
  });

  it('returns 401 when admin token is missing', async () => {
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
      headers: { 'x-admin-token': 'test-admin-token' },
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
