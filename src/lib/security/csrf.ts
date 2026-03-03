import type { ApiError } from '@/lib/api-envelope';

type CsrfResult =
  | { ok: true }
  | { ok: false; status: 403; error: ApiError };

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfEnabled(): boolean {
  if (process.env.CSRF_ENABLED === 'true') {
    return true;
  }
  if (process.env.CSRF_ENABLED === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

function getExpectedOrigin(request: Request): string | null {
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) {
    return null;
  }
  return normalizeOrigin(`${proto}://${host}`);
}

export function validateCsrf(request: Request): CsrfResult {
  if (!csrfEnabled() || !STATE_CHANGING.has(request.method.toUpperCase())) {
    return { ok: true };
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return {
      ok: false,
      status: 403,
      error: { code: 'FORBIDDEN', message: 'Cross-site request blocked' },
    };
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return { ok: true };
  }

  const expected = getExpectedOrigin(request);
  if (!expected) {
    return { ok: true };
  }

  if (normalizeOrigin(origin) !== expected) {
    return {
      ok: false,
      status: 403,
      error: { code: 'FORBIDDEN', message: 'CSRF validation failed' },
    };
  }

  return { ok: true };
}
