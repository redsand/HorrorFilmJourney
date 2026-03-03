import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import { makeSessionCookie } from '../helpers/session-cookie';

describe('admin feedback access middleware', () => {
  it('allows admin session to access /admin/feedback', async () => {
    const request = new NextRequest('http://localhost/admin/feedback', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    });
    const response = await middleware(request);
    expect(response.status).toBe(200);
  });

  it('blocks non-admin session for /admin/feedback', async () => {
    const request = new NextRequest('http://localhost/admin/feedback', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    });
    const response = await middleware(request);
    expect(response.status).toBe(403);
  });
});

