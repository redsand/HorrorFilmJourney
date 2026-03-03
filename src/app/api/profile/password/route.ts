import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/prisma';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, 'currentPassword must be at least 8 characters'),
  newPassword: z.string().min(8, 'newPassword must be at least 8 characters'),
});

export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload',
      },
      400,
    );
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return fail({ code: 'VALIDATION_ERROR', message: 'New password must be different from current password' }, 400);
  }

  const credential = await prisma.userCredential.findFirst({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, passwordHash: true },
  });

  if (!credential || !verifyPassword(parsed.data.currentPassword, credential.passwordHash)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'Current password is incorrect' }, 400);
  }

  await prisma.userCredential.update({
    where: { id: credential.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });

  return ok({ success: true }, { status: 200 });
}

