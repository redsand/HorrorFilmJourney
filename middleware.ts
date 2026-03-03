import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/security/csrf';

type SessionPayload = {
  userId: string;
  isAdmin: boolean;
  exp: number;
};

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? 'dev-session-secret';
}

function parseCookie(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${key}=`)) {
      continue;
    }
    return trimmed.slice(key.length + 1);
  }
  return null;
}

function toBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return padded;
}

function fromBase64UrlToString(value: string): string {
  return atob(toBase64(value));
}

function fromStringToBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(payloadB64: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(getSessionSecret());
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const bytes = String.fromCharCode(...new Uint8Array(signature));
  return fromStringToBase64Url(bytes);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function readSession(request: NextRequest): Promise<SessionPayload | null> {
  const token = parseCookie(request.headers.get('cookie'), 'hfj_session');
  if (!token) {
    return null;
  }
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return null;
  }
  const expected = await sign(payloadB64);
  if (!safeEqual(expected, signature)) {
    return null;
  }
  try {
    const payload = JSON.parse(fromBase64UrlToString(payloadB64)) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  const scriptSrc = process.env.NODE_ENV === 'development'
    ? "'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/"
    : "'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/";
  const connectSrc = process.env.NODE_ENV === 'development'
    ? "'self' ws: wss: https://www.google.com/recaptcha/"
    : "'self' https://www.google.com/recaptcha/";

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://image.tmdb.org https://images.justwatch.com https://www.google.com https://www.gstatic.com",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Request-Id', crypto.randomUUID());
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    const csrf = validateCsrf(request);
    if (!csrf.ok) {
      return applySecurityHeaders(
        NextResponse.json({ data: null, error: csrf.error }, { status: csrf.status }),
      );
    }
  }

  if (pathname === '/login' || pathname === '/signup') {
    return applySecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith('/admin/')) {
    const session = await readSession(request);
    if (!session) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/login', request.url)));
    }
    if (!session.isAdmin) {
      return applySecurityHeaders(
        NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 403 }),
      );
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*', '/login', '/signup', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
