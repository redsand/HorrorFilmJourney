import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

const findUniqueMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
    },
  },
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    findUniqueMock.mockReset();
  });

  it('returns 401 when admin token is missing', async () => {
    const request = new Request('http://localhost/api/health');
    const response = await GET(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid admin token',
      },
    });
  });

  it('returns 400 when X-User-Id is missing', async () => {
    const request = new Request('http://localhost/api/health', {
      headers: { 'x-admin-token': 'test-admin-token' },
    });

    const response = await GET(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Missing X-User-Id header',
      },
    });
  });

  it('returns 400 when X-User-Id does not map to a user', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/health', {
      headers: {
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'missing-user',
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'X-User-Id does not map to an existing user',
      },
    });
  });

  it('returns 200 with stable success envelope', async () => {
    findUniqueMock.mockResolvedValueOnce({ id: 'user_1', displayName: 'Ash' });

    const request = new Request('http://localhost/api/health', {
      headers: {
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { ok: true },
      error: null,
    });
  });
});
