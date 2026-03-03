import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as LOGIN_POST } from '@/app/api/auth/login/route';
import { POST as SIGNUP_POST } from '@/app/api/auth/signup/route';
import { resetRateLimitStore } from '@/lib/security/rate-limit';

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

describe('auth rate limiting', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CAPTCHA_ENABLED: 'false',
      AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      AUTH_RATE_LIMIT_MAX_ATTEMPTS: '1',
    };
    resetRateLimitStore();
    userCredentialFindUniqueMock.mockReset();
    txUserCreateMock.mockReset();
    txUserCredentialCreateMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetRateLimitStore();
  });

  it('rate limits repeated signup attempts', async () => {
    userCredentialFindUniqueMock.mockResolvedValue(null);
    txUserCreateMock.mockResolvedValue({ id: 'user_1', displayName: 'User One' });
    txUserCredentialCreateMock.mockResolvedValue({});

    const first = await SIGNUP_POST(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          displayName: 'User One',
        }),
      }),
    );
    expect(first.status).toBe(200);

    const second = await SIGNUP_POST(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          displayName: 'User One',
        }),
      }),
    );
    expect(second.status).toBe(429);
  });

  it('rate limits repeated login attempts', async () => {
    userCredentialFindUniqueMock.mockResolvedValue(null);

    const first = await LOGIN_POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '5.6.7.8' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      }),
    );
    expect(first.status).toBe(401);

    const second = await LOGIN_POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '5.6.7.8' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      }),
    );
    expect(second.status).toBe(429);
  });
});
