import type { PrismaClient } from '@prisma/client';
import type { ApiError } from '@/lib/api-envelope';
import { readSessionFromRequest } from '@/lib/auth/session';

type AuthSuccess = { ok: true; userId: string; isAdmin: boolean };
type AuthFailure = { ok: false; error: ApiError; status: 401 | 403 };

function allowLegacyHeaders(): boolean {
  return process.env.DEV_LEGACY_HEADERS === 'true';
}

function getAdminToken(): string {
  return process.env.ADMIN_TOKEN ?? 'dev-admin-token';
}

export async function requireAuth(request: Request, prisma: PrismaClient): Promise<AuthSuccess | AuthFailure> {
  const session = readSessionFromRequest(request);

  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } });
    if (!user) {
      return {
        ok: false,
        status: 401,
        error: { code: 'UNAUTHORIZED', message: 'Invalid session' },
      };
    }
    return { ok: true, userId: user.id, isAdmin: session.isAdmin };
  }

  if (allowLegacyHeaders()) {
    const legacyUserId = request.headers.get('x-user-id');
    if (legacyUserId) {
      const user = await prisma.user.findUnique({ where: { id: legacyUserId }, select: { id: true } });
      if (user) {
        return { ok: true, userId: user.id, isAdmin: false };
      }
    }
  }

  return {
    ok: false,
    status: 401,
    error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
  };
}

export async function requireAdmin(request: Request, prisma?: PrismaClient): Promise<AuthSuccess | AuthFailure> {
  const session = readSessionFromRequest(request);

  if (session) {
    if (!session.isAdmin) {
      return {
        ok: false,
        status: 403,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      };
    }

    if (prisma) {
      const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } });
      if (!user) {
        return {
          ok: false,
          status: 401,
          error: { code: 'UNAUTHORIZED', message: 'Invalid session' },
        };
      }
    }

    return { ok: true, userId: session.userId, isAdmin: true };
  }

  if (allowLegacyHeaders()) {
    const token = request.headers.get('x-admin-token');
    if (token && token === getAdminToken()) {
      return { ok: true, userId: 'legacy-admin', isAdmin: true };
    }
  }

  return {
    ok: false,
    status: 401,
    error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
  };
}
