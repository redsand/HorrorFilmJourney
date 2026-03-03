import { prisma } from '@/lib/prisma';
import { fail, ok } from '@/lib/api-envelope';
import { hashPassword } from '@/lib/auth/password';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/audit/audit';

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const displayName = body?.displayName;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
  const password = typeof body?.password === 'string' ? body.password : null;
  const isAdmin = body?.isAdmin === true;

  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return fail({ code: 'VALIDATION_ERROR', message: 'displayName is required' }, 400);
  }

  if ((email && !password) || (!email && password)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'email and password must be provided together' }, 400);
  }

  if (email && password.length < 8) {
    return fail({ code: 'VALIDATION_ERROR', message: 'password must be at least 8 characters' }, 400);
  }

  if (email) {
    const existing = await prisma.userCredential.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return fail({ code: 'CONFLICT', message: 'Email already in use' }, 409);
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        displayName: displayName.trim(),
      },
      select: {
        id: true,
        displayName: true,
        createdAt: true,
      },
    });

    if (email && password) {
      await tx.userCredential.create({
        data: {
          userId: created.id,
          email,
          passwordHash: hashPassword(password),
          isAdmin,
        },
      });
    }

    return created;
  });

  await logAuditEvent(prisma, {
    adminUserId: auth.userId,
    action: 'ADMIN_USER_CREATE',
    targetId: user.id,
    metadata: { hasCredential: Boolean(email && password), isAdmin },
  });

  return ok(user, { status: 200 });
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const q = new URL(request.url).searchParams.get('q')?.trim();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      credentials: {
        select: {
          email: true,
          isAdmin: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
    ...(q ? { where: { displayName: { contains: q, mode: 'insensitive' } } } : {}),
    orderBy: { createdAt: 'desc' },
  });

  return ok(
    users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      createdAt: user.createdAt,
      email: user.credentials[0]?.email ?? null,
      role: user.credentials[0]?.isAdmin ? 'ADMIN' : 'USER',
    })),
    { status: 200 },
  );
}
