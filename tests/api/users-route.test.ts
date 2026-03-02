import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/users/route';

const { createMock, findManyMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      create: createMock,
      findMany: findManyMock,
    },
  },
}));

describe('/api/users route', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    createMock.mockReset();
    findManyMock.mockReset();
  });

  it('returns 401 for POST when admin token is missing', async () => {
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Ripley' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('creates user and returns 200 envelope', async () => {
    createMock.mockResolvedValueOnce({
      id: 'user_1',
      displayName: 'Ripley',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Ripley' }),
      headers: {
        'content-type': 'application/json',
        'x-admin-token': 'test-admin-token',
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: 'user_1',
        displayName: 'Ripley',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      error: null,
    });
  });

  it('lists users and includes created user', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: 'user_1',
        displayName: 'Ripley',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ]);

    const request = new Request('http://localhost/api/users', {
      headers: { 'x-admin-token': 'test-admin-token' },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 'user_1',
          displayName: 'Ripley',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    });
  });
});
