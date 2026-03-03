import { fail, ok } from '@/lib/api-envelope';
import { InteractionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { summarizeTasteEvolution } from '@/lib/taste/taste-evolution-service';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const snapshots = await prisma.tasteSnapshot.findMany({
    where: { userId: auth.userId },
    orderBy: { takenAt: 'asc' },
    take: 24,
    select: {
      takenAt: true,
      intensityPreference: true,
      pacingPreference: true,
      psychologicalVsSupernatural: true,
      goreTolerance: true,
      ambiguityTolerance: true,
      nostalgiaBias: true,
      auteurAffinity: true,
    },
  });

  const interactionSpan = snapshots.length > 1
    ? await prisma.userMovieInteraction.count({
      where: {
        userId: auth.userId,
        status: { in: [InteractionStatus.WATCHED, InteractionStatus.ALREADY_SEEN] },
        createdAt: {
          gte: snapshots[0]!.takenAt,
          lte: snapshots[snapshots.length - 1]!.takenAt,
        },
      },
    })
    : 0;

  return ok({
    snapshots: snapshots.map((item) => ({
      ...item,
      takenAt: item.takenAt.toISOString(),
    })),
    evolutionNarrative: summarizeTasteEvolution({
      snapshots,
      interactionSpan,
    }),
  });
}
