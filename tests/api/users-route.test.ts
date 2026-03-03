import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/users/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const { createMock, findManyMock, userFindUniqueMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  findManyMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}));
const { findCredentialMock } = vi.hoisted(() => ({
  findCredentialMock: vi.fn(),
}));
const { auditEventCreateMock } = vi.hoisted(() => ({
  auditEventCreateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        user: { create: createMock },
        userCredential: { create: vi.fn() },
      }),
    user: {
      create: createMock,
      findMany: findManyMock,
      findUnique: userFindUniqueMock,
    },
    userCredential: {
      findUnique: findCredentialMock,
    },
    auditEvent: {
      create: auditEventCreateMock,
    },
  },
}));

describe('/api/users route', () => {
  beforeEach(() => {
    createMock.mockReset();
    findManyMock.mockReset();
    findCredentialMock.mockReset();
    userFindUniqueMock.mockReset();
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    auditEventCreateMock.mockReset();
    auditEventCreateMock.mockResolvedValue({});
  });

  it('returns 401 for POST when admin session is missing', async () => {
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Ripley' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 403 for GET when logged-in user is not admin', async () => {
    const request = new Request('http://localhost/api/users', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    });

    const response = await GET(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
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
        cookie: makeSessionCookie('admin_1', true),
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
        credentials: [{ email: 'ripley@example.com', isAdmin: false }],
      },
    ]);

    const request = new Request('http://localhost/api/users', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 'user_1',
          displayName: 'Ripley',
          createdAt: '2025-01-01T00:00:00.000Z',
          email: 'ripley@example.com',
          role: 'USER',
        },
      ],
      error: null,
    });
  });
});
