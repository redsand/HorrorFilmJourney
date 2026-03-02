import { InteractionStatus } from '@prisma/client';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
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
      userId: auth.userId,
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

  const items = interactions.map((interaction) => ({
    interactionId: interaction.id,
    status: interaction.status,
    rating: interaction.rating,
    createdAt: interaction.createdAt,
    tags: {
      emotions: Array.isArray(interaction.emotions) ? interaction.emotions : [],
      intensity: interaction.intensity,
      agedWell: interaction.agedWell,
    },
    movie: interaction.movie,
  }));

  const nextCursor = interactions.length === limit ? interactions.at(-1)?.id : undefined;

  return ok({ items, pageInfo: { ...(nextCursor ? { nextCursor } : {}) } }, { status: 200 });
}
