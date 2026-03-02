import type { PrismaClient, User } from '@prisma/client';

type ValidationError = { code: 'VALIDATION_ERROR'; message: string };

export async function getCurrentUserId(
  request: Request,
  prisma: PrismaClient,
): Promise<{ userId: string | null; error: ValidationError | null }> {
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return {
      userId: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Missing X-User-Id header',
      },
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return {
      userId: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'X-User-Id does not map to an existing user',
      },
    };
  }

  return { userId: user.id, error: null };
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
        message: 'X-User-Id does not map to an existing user',
      },
    };
  }

  return { user, error: null };
}
