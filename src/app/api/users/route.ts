import { prisma } from '@/lib/prisma';
import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';

export async function POST(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const body = await request.json().catch(() => null);
  const displayName = body?.displayName;

  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return fail({ code: 'VALIDATION_ERROR', message: 'displayName is required' }, 400);
  }

  const user = await prisma.user.create({
    data: {
      displayName: displayName.trim(),
    },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
    },
  });

  return ok(user, { status: 200 });
}

export async function GET(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return ok(users, { status: 200 });
}
