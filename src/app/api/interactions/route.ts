import { InteractionStatus } from '@prisma/client';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';
import { requireAuth } from '@/lib/auth/guards';
import { TasteComputationService } from '@/lib/taste/taste-computation-service';
import { JourneyProgressionService } from '@/lib/journey/journey-progression-service';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid request body' }, 400);
  }

  const {
    tmdbId,
    status,
    rating,
    intensity,
    emotions,
    workedBest,
    agedWell,
    recommend,
    note,
    recommendationItemId,
  } = body as Record<string, unknown>;

  const validStatus = Object.values(InteractionStatus).includes(status as InteractionStatus);
  if (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId) || !validStatus) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId and valid status are required' }, 400);
  }

  if ((status === 'WATCHED' || status === 'ALREADY_SEEN') && !isRating(rating)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'rating is required for WATCHED and ALREADY_SEEN' }, 400);
  }

  if (rating !== undefined && !isRating(rating)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'rating must be an integer from 1 to 5 when provided' }, 400);
  }

  if (intensity !== undefined && !isRating(intensity)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'intensity must be an integer from 1 to 5 when provided' }, 400);
  }

  if (emotions !== undefined && !isStringArray(emotions)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'emotions must be an array of strings when provided' }, 400);
  }

  if (workedBest !== undefined && !isStringArray(workedBest)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'workedBest must be an array of strings when provided' }, 400);
  }

  const movie = await prisma.movie.findUnique({ where: { tmdbId } });
  if (!movie) {
    return fail({ code: 'NOT_FOUND', message: 'Movie not found for tmdbId' }, 404);
  }

  const effectivePack = await resolveEffectivePackForUser(prisma, auth.userId);

  const interaction = await prisma.userMovieInteraction.create({
    data: {
      userId: auth.userId,
      movieId: movie.id,
      ...(effectivePack.packId ? { packId: effectivePack.packId } : {}),
      status: status as InteractionStatus,
      rating: rating as number | undefined,
      intensity: intensity as number | undefined,
      emotions: emotions as string[] | undefined,
      workedBest: workedBest as string[] | undefined,
      agedWell: agedWell as string | undefined,
      recommend: recommend as boolean | undefined,
      note: note as string | undefined,
      recommendationItemId: recommendationItemId as string | undefined,
    },
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

  if (status !== InteractionStatus.WANT_TO_WATCH) {
    await prisma.userMovieInteraction.deleteMany({
      where: {
        userId: auth.userId,
        movieId: movie.id,
        ...(effectivePack.packId ? { packId: effectivePack.packId } : {}),
        status: InteractionStatus.WANT_TO_WATCH,
        id: { not: interaction.id },
      },
    });
  }

  if (status === InteractionStatus.WATCHED || status === InteractionStatus.ALREADY_SEEN) {
    try {
      const tasteService = new TasteComputationService(prisma);
      await tasteService.computeTasteProfile(auth.userId, {
        packId: effectivePack.packId ?? null,
        persist: false,
      });
    } catch (error) {
      console.warn('[taste.profile] recompute failed', {
        userId: auth.userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  if (status === InteractionStatus.WATCHED) {
    try {
      const progressionService = new JourneyProgressionService(prisma);
      await progressionService.trackWatched({
        userId: auth.userId,
        recommendationItemId: (recommendationItemId as string | undefined) ?? null,
        rating: (rating as number | undefined) ?? null,
        intensity: (intensity as number | undefined) ?? null,
        emotions: (emotions as string[] | undefined) ?? null,
        workedBest: (workedBest as string[] | undefined) ?? null,
        agedWell: (agedWell as string | undefined) ?? null,
        recommend: (recommend as boolean | undefined) ?? null,
        note: (note as string | undefined) ?? null,
      }, { packId: effectivePack.packId ?? null });
    } catch (error) {
      console.warn('[journey.progress] update failed', {
        userId: auth.userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  let nextBatch: Awaited<ReturnType<typeof generateRecommendationBatch>> | undefined;

  if (status === InteractionStatus.ALREADY_SEEN && typeof recommendationItemId === 'string') {
    const recommendationItem = await prisma.recommendationItem.findUnique({
      where: { id: recommendationItemId },
      select: { batchId: true },
    });

    if (recommendationItem?.batchId) {
      const alreadySeenCount = await prisma.userMovieInteraction.count({
        where: {
          userId: auth.userId,
          status: InteractionStatus.ALREADY_SEEN,
          recommendationItem: {
            batchId: recommendationItem.batchId,
            batch: { userId: auth.userId },
          },
        },
      });

      if (alreadySeenCount >= 3) {
        nextBatch = await generateRecommendationBatch(auth.userId, prisma);
      }
    }
  }

  return ok({ interaction, ...(nextBatch ? { nextBatch } : {}) }, { status: 200 });
}
