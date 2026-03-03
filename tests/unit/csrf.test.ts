import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateCsrf } from '@/lib/security/csrf';

const originalEnv = { ...process.env };

describe('validateCsrf', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, CSRF_ENABLED: 'true' };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('blocks cross-site state-changing requests', () => {
    const result = validateCsrf(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'x-forwarded-proto': 'http',
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it('allows same-origin requests', () => {
    const result = validateCsrf(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'x-forwarded-proto': 'http',
          origin: 'http://localhost:3000',
          'sec-fetch-site': 'same-origin',
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});
