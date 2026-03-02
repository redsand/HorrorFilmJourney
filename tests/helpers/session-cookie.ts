import { createSessionToken } from '@/lib/auth/session';

export function makeSessionCookie(userId: string, isAdmin = false): string {
  return `hfj_session=${createSessionToken(userId, isAdmin)}`;
}
