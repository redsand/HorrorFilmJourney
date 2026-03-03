import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as LOGIN_POST } from '@/app/api/auth/login/route';
import { POST as SIGNUP_POST } from '@/app/api/auth/signup/route';

const originalEnv = { ...process.env };

const {
  userCredentialFindUniqueMock,
  txUserCreateMock,
  txUserCredentialCreateMock,
} = vi.hoisted(() => ({
  userCredentialFindUniqueMock: vi.fn(),
  txUserCreateMock: vi.fn(),
  txUserCredentialCreateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userCredential: { findUnique: userCredentialFindUniqueMock },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        user: { create: txUserCreateMock },
        userCredential: { create: txUserCredentialCreateMock },
      }),
  },
}));

describe('auth routes captcha enforcement', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, CAPTCHA_ENABLED: 'true', RECAPTCHA_SECRET_KEY: 'secret' };
    userCredentialFindUniqueMock.mockReset();
    txUserCreateMock.mockReset();
    txUserCredentialCreateMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects signup without captcha token when enabled', async () => {
    const response = await SIGNUP_POST(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'password123',
          displayName: 'User',
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'CAPTCHA_REQUIRED', message: 'Captcha verification is required' },
    });
  });

  it('rejects login without captcha token when enabled', async () => {
    const response = await LOGIN_POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'password123',
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'CAPTCHA_REQUIRED', message: 'Captcha verification is required' },
    });
  });
});
