import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyCaptchaToken } from '@/lib/security/captcha';

const originalEnv = { ...process.env };

describe('captcha verification', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('passes when captcha is disabled', async () => {
    process.env.CAPTCHA_ENABLED = 'false';
    const result = await verifyCaptchaToken({
      token: undefined,
      request: new Request('http://localhost'),
      expectedAction: 'login',
    });

    expect(result).toEqual({ ok: true });
  });

  it('fails when captcha is enabled and token is missing', async () => {
    process.env.CAPTCHA_ENABLED = 'true';
    process.env.RECAPTCHA_SECRET_KEY = 'secret';
    const result = await verifyCaptchaToken({
      token: '',
      request: new Request('http://localhost'),
      expectedAction: 'login',
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: { code: 'CAPTCHA_REQUIRED', message: 'Captcha verification is required' },
    });
  });

  it('fails when score is below threshold', async () => {
    process.env.CAPTCHA_ENABLED = 'true';
    process.env.RECAPTCHA_SECRET_KEY = 'secret';
    process.env.RECAPTCHA_MIN_SCORE = '0.8';

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        score: 0.2,
        action: 'login',
      }),
    })));

    const result = await verifyCaptchaToken({
      token: 'token-1',
      request: new Request('http://localhost'),
      expectedAction: 'login',
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: { code: 'CAPTCHA_INVALID', message: 'Captcha score too low' },
    });
  });

  it('passes for valid action and sufficient score', async () => {
    process.env.CAPTCHA_ENABLED = 'true';
    process.env.RECAPTCHA_SECRET_KEY = 'secret';
    process.env.RECAPTCHA_MIN_SCORE = '0.5';

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        score: 0.9,
        action: 'signup',
      }),
    })));

    const result = await verifyCaptchaToken({
      token: 'token-2',
      request: new Request('http://localhost', {
        headers: { 'x-forwarded-for': '1.2.3.4' },
      }),
      expectedAction: 'signup',
    });

    expect(result).toEqual({ ok: true });
  });
});
