import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE_NAME = 'hfj_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  isAdmin: boolean;
  exp: number;
};

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? 'dev-session-secret';
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', getSessionSecret()).update(payloadB64).digest('base64url');
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const index = pair.indexOf('=');
      if (index <= 0) {
        return acc;
      }
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

export function createSessionToken(userId: string, isAdmin: boolean): string {
  const payload: SessionPayload = {
    userId,
    isAdmin,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readSessionFromRequest(request: Request): SessionPayload | null {
  const cookieHeader = request.headers.get('cookie');
  const parsed = parseCookieHeader(cookieHeader);
  const token = parsed[SESSION_COOKIE_NAME];

  if (!token) {
    return null;
  }

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return null;
  }

  const expected = sign(payloadB64);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as SessionPayload;
    if (!payload.userId || typeof payload.isAdmin !== 'boolean' || !payload.exp) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieName = SESSION_COOKIE_NAME;
