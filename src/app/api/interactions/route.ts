import { InteractionStatus } from '@prisma/client';
import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/request-context';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export async function POST(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { userId, error } = await getCurrentUserId(request, prisma);
  if (error || !userId) {
    return fail(error ?? { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' }, 400);
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

  const interaction = await prisma.userMovieInteraction.create({
    data: {
      userId,
      movieId: movie.id,
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

  return ok(interaction, { status: 200 });
}
