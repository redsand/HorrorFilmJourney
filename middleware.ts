import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/login' || pathname === '/signup') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin/')) {
    const session = await readSession(request);
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (!session.isAdmin) {
      return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/login', '/signup'],
};
