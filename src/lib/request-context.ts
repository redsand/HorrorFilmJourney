import type { PrismaClient, User } from '@prisma/client';
import { requireAuth } from '@/lib/auth/guards';

type ValidationError = { code: 'VALIDATION_ERROR'; message: string };

export async function getCurrentUserId(
  request: Request,
  prisma: PrismaClient,
): Promise<{ userId: string | null; error: ValidationError | null }> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return {
      userId: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: auth.error.message,
      },
    };
  }
  return { userId: auth.userId, error: null };
}

export async function resolveCurrentUser(
  request: Request,
  prisma: PrismaClient,
): Promise<{ user: User | null; error: ValidationError | null }> {
  const result = await getCurrentUserId(request, prisma);
  if (result.error || !result.userId) {
    return { user: null, error: result.error };
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });

  if (!user) {
    return {
      user: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Authenticated user does not exist',
      },
    };
  }

  return { user, error: null };
}
