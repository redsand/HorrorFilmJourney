import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/feedback/route';
import { DELETE, PATCH } from '@/app/api/admin/feedback/[id]/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const { findManyMock, updateMock, deleteMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    feedback: {
      findMany: findManyMock,
      update: updateMock,
      delete: deleteMock,
    },
  },
}));

describe('/api/admin/feedback routes', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
  });

  it('returns 403 for non-admin list request', async () => {
    const request = new Request('http://localhost/api/admin/feedback', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    });

    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it('allows admin to list feedback with filters', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: 'fb_1',
        type: 'BUG',
        category: 'UX',
        title: 'Poster missing',
        description: 'Poster is blank in companion mode.',
        route: '/companion/17',
        userAgent: 'Mozilla',
        appVersion: null,
        status: 'OPEN',
        priority: 'MEDIUM',
        createdAt: new Date('2026-03-03T00:00:00.000Z'),
        updatedAt: new Date('2026-03-03T00:00:00.000Z'),
        user: {
          id: 'user_1',
          displayName: 'Tim',
          credentials: [{ email: 'tim@example.com' }],
        },
      },
    ]);

    const request = new Request('http://localhost/api/admin/feedback?status=OPEN&type=BUG&priority=MEDIUM&search=poster', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledOnce();
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'OPEN',
        type: 'BUG',
        priority: 'MEDIUM',
        OR: expect.any(Array),
      }),
    }));
    await expect(response.json()).resolves.toEqual({
      data: {
        items: [
          {
            id: 'fb_1',
            type: 'BUG',
            category: 'UX',
            title: 'Poster missing',
            description: 'Poster is blank in companion mode.',
            route: '/companion/17',
            userAgent: 'Mozilla',
            appVersion: null,
            status: 'OPEN',
            priority: 'MEDIUM',
            createdAt: '2026-03-03T00:00:00.000Z',
            updatedAt: '2026-03-03T00:00:00.000Z',
            user: {
              id: 'user_1',
              displayName: 'Tim',
              email: 'tim@example.com',
            },
          },
        ],
        nextCursor: null,
      },
      error: null,
    });
  });

  it('allows admin to update feedback status', async () => {
    updateMock.mockResolvedValueOnce({
      id: 'fb_1',
      status: 'IN_REVIEW',
      priority: 'HIGH',
    });

    const request = new Request('http://localhost/api/admin/feedback/fb_1', {
      method: 'PATCH',
      headers: {
        cookie: makeSessionCookie('admin_1', true),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'IN_REVIEW', priority: 'HIGH' }),
    });

    const response = await PATCH(request, { params: { id: 'fb_1' } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: 'fb_1',
        status: 'IN_REVIEW',
        priority: 'HIGH',
      },
      error: null,
    });
  });

  it('allows admin to delete feedback', async () => {
    deleteMock.mockResolvedValueOnce({ id: 'fb_1' });

    const request = new Request('http://localhost/api/admin/feedback/fb_1', {
      method: 'DELETE',
      headers: { cookie: makeSessionCookie('admin_1', true) },
    });

    const response = await DELETE(request, { params: { id: 'fb_1' } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'fb_1', deleted: true },
      error: null,
    });
  });
});
