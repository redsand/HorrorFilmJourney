import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
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

  it('returns 200 when admin token is present and no user header is provided', async () => {
    const request = new Request('http://localhost/api/health', {
      headers: { 'x-admin-token': 'test-admin-token' },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { ok: true },
      error: null,
    });
  });
});
