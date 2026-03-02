import { InteractionStatus } from '@prisma/client';
import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/request-context';

export async function GET(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { userId, error } = await getCurrentUserId(request, prisma);
  if (error || !userId) {
    return fail(error ?? { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' }, 400);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limitParam = url.searchParams.get('limit');
  const cursor = url.searchParams.get('cursor');

  const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return fail({ code: 'VALIDATION_ERROR', message: 'limit must be an integer between 1 and 100' }, 400);
  }

  if (status && !Object.values(InteractionStatus).includes(status as InteractionStatus)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'status must be a valid interaction status' }, 400);
  }

  const interactions = await prisma.userMovieInteraction.findMany({
    where: {
      userId,
      ...(status ? { status: status as InteractionStatus } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      movie: {
        select: {
          tmdbId: true,
          title: true,
          year: true,
          posterUrl: true,
        },
      },
    },
  });

  return ok(interactions, { status: 200 });
}
