import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from '@/app/api/profile/password/route';
import { verifyPassword } from '@/lib/auth/password';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  credentialFindFirstMock,
  credentialUpdateMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  credentialFindFirstMock: vi.fn(),
  credentialUpdateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
    userCredential: {
      findFirst: credentialFindFirstMock,
      update: credentialUpdateMock,
    },
  },
}));

describe('PATCH /api/profile/password', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    credentialFindFirstMock.mockReset();
    credentialUpdateMock.mockReset();
  });

  it('returns 401 without auth session', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/profile/password', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'old-pass-1', newPassword: 'new-pass-1' }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });

    const response = await PATCH(
      new Request('http://localhost/api/profile/password', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: makeSessionCookie('user_1'),
        },
        body: JSON.stringify({ currentPassword: 'short', newPassword: 'short' }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'currentPassword must be at least 8 characters',
      },
    });
  });

  it('returns 400 when current password is incorrect', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    credentialFindFirstMock.mockResolvedValue({
      id: 'cred_1',
      passwordHash: 'salt:bad-hash-format',
    });

    const response = await PATCH(
      new Request('http://localhost/api/profile/password', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: makeSessionCookie('user_1'),
        },
        body: JSON.stringify({
          currentPassword: 'current-password',
          newPassword: 'new-password',
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Current password is incorrect',
      },
    });
    expect(credentialUpdateMock).not.toHaveBeenCalled();
  });

  it('updates password hash when current password is valid', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    const { hashPassword } = await import('@/lib/auth/password');
    const existingHash = hashPassword('current-password');
    credentialFindFirstMock.mockResolvedValue({
      id: 'cred_1',
      passwordHash: existingHash,
    });
    credentialUpdateMock.mockResolvedValue({});

    const response = await PATCH(
      new Request('http://localhost/api/profile/password', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: makeSessionCookie('user_1'),
        },
        body: JSON.stringify({
          currentPassword: 'current-password',
          newPassword: 'brand-new-password',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const updateArg = credentialUpdateMock.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({ id: 'cred_1' });
    expect(typeof updateArg.data.passwordHash).toBe('string');
    expect(updateArg.data.passwordHash).not.toBe(existingHash);
    expect(verifyPassword('brand-new-password', updateArg.data.passwordHash)).toBe(true);
  });
});

