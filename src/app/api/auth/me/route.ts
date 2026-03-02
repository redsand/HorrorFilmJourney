import { ok, fail } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const credential = await prisma.userCredential.findFirst({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'asc' },
    select: {
      email: true,
      isAdmin: true,
      user: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  if (!credential) {
    return fail({ code: 'UNAUTHORIZED', message: 'Account has no credentials' }, 401);
  }

  return ok(
    {
      id: credential.user.id,
      displayName: credential.user.displayName,
      email: credential.email,
      role: credential.isAdmin ? 'ADMIN' : 'USER',
    },
    { status: 200 },
  );
}
