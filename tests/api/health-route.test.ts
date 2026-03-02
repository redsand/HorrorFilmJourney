import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { makeSessionCookie } from '../helpers/session-cookie';

describe('GET /api/health', () => {
  it('returns 401 when admin session is missing', async () => {
    const request = new Request('http://localhost/api/health');
    const response = await GET(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  });

  it('returns 200 when admin session cookie is present', async () => {
    const request = new Request('http://localhost/api/health', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { ok: true },
      error: null,
    });
  });
});
