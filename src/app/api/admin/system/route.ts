import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const [errors, feedback, audits] = await Promise.all([
    prisma.appErrorLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        route: true,
        code: true,
        message: true,
        requestId: true,
        userId: true,
        createdAt: true,
      },
    }),
    prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        status: true,
        priority: true,
        title: true,
        route: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            credentials: {
              select: { email: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        targetId: true,
        createdAt: true,
        userId: true,
      },
    }),
  ]);

  return ok({
    errors,
    feedback: feedback.map((item) => ({
      ...item,
      user: {
        id: item.user.id,
        displayName: item.user.displayName,
        email: item.user.credentials[0]?.email ?? null,
      },
    })),
    jobs: [],
    audits,
  });
}
