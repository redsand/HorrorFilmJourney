import { prisma } from '@/lib/prisma';
import { fail, ok } from '@/lib/api-envelope';
import { hashPassword } from '@/lib/auth/password';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/audit/audit';

type Context = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, context: Context): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const user = await prisma.user.findUnique({
    where: { id: context.params.id },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      profile: {
        select: {
          tolerance: true,
          pacePreference: true,
        },
      },
    },
  });

  if (!user) {
    return fail({ code: 'NOT_FOUND', message: 'User not found' }, 404);
  }

  return ok(user, { status: 200 });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid request body' }, 400);
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
  const role = body.role === 'ADMIN' || body.role === 'USER' ? body.role : null;
  const password = typeof body.password === 'string' ? body.password : null;

  if (!displayName && !email && !role && !password) {
    return fail({ code: 'VALIDATION_ERROR', message: 'No updates provided' }, 400);
  }

  if (password && password.length < 8) {
    return fail({ code: 'VALIDATION_ERROR', message: 'password must be at least 8 characters' }, 400);
  }

  const existing = await prisma.user.findUnique({
    where: { id: context.params.id },
    select: {
      id: true,
      credentials: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { id: true, email: true, isAdmin: true },
      },
    },
  });

  if (!existing) {
    return fail({ code: 'NOT_FOUND', message: 'User not found' }, 404);
  }

  const credential = existing.credentials[0];
  if (!credential) {
    return fail({ code: 'VALIDATION_ERROR', message: 'User has no credential record' }, 400);
  }

  if (role === 'USER' && credential.isAdmin) {
    const adminCount = await prisma.userCredential.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Cannot remove the last admin' }, 400);
    }
  }

  if (email && email !== credential.email) {
    const duplicate = await prisma.userCredential.findUnique({
      where: { email },
      select: { id: true },
    });
    if (duplicate) {
      return fail({ code: 'CONFLICT', message: 'Email already in use' }, 409);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (displayName) {
      await tx.user.update({
        where: { id: existing.id },
        data: { displayName },
      });
    }

    await tx.userCredential.update({
      where: { id: credential.id },
      data: {
        ...(email ? { email } : {}),
        ...(role ? { isAdmin: role === 'ADMIN' } : {}),
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      },
    });

    return tx.user.findUnique({
      where: { id: existing.id },
      select: {
        id: true,
        displayName: true,
        credentials: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { email: true, isAdmin: true },
        },
      },
    });
  });

  await logAuditEvent(prisma, {
    adminUserId: auth.userId,
    action: password ? 'ADMIN_PASSWORD_RESET' : 'ADMIN_USER_EDIT',
    targetId: existing.id,
    metadata: {
      displayNameChanged: Boolean(displayName),
      emailChanged: Boolean(email),
      roleChanged: Boolean(role),
      passwordChanged: Boolean(password),
    },
  });

  return ok(
    {
      id: updated?.id,
      displayName: updated?.displayName,
      email: updated?.credentials[0]?.email ?? null,
      role: updated?.credentials[0]?.isAdmin ? 'ADMIN' : 'USER',
    },
    { status: 200 },
  );
}
