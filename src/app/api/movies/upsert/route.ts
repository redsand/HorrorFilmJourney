import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { normalizeRating } from '@/lib/ratings/rating-normalizer';
import { getCurrentUserId } from '@/lib/request-context';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export async function POST(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { error } = await getCurrentUserId(request, prisma);
  if (error) {
    return fail(error, 400);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid request body' }, 400);
  }

  const { tmdbId, title, year, posterUrl, genres, ratings } = body as Record<string, unknown>;

  if (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId) || typeof title !== 'string' || title.trim().length === 0) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId (number) and title (string) are required' }, 400);
  }

  if (year !== undefined && (typeof year !== 'number' || !Number.isInteger(year))) {
    return fail({ code: 'VALIDATION_ERROR', message: 'year must be an integer when provided' }, 400);
  }

  if (typeof posterUrl !== 'string' || posterUrl.trim().length === 0) {
    return fail({ code: 'VALIDATION_ERROR', message: 'posterUrl is required and must be a non-empty string' }, 400);
  }

  if (genres !== undefined && !isStringArray(genres)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'genres must be an array of strings when provided' }, 400);
  }

  if (
    ratings !== undefined
    && (!Array.isArray(ratings)
      || !ratings.every((rating) => typeof rating === 'object' && rating !== null && typeof (rating as Record<string, unknown>).source === 'string' && typeof (rating as Record<string, unknown>).rawValue === 'string'))
  ) {
    return fail({ code: 'VALIDATION_ERROR', message: 'ratings must be an array of { source, rawValue } when provided' }, 400);
  }

  const normalizedRatingsInput = (ratings as Array<{ source: string; rawValue: string }> | undefined)?.map((rating) => {
    try {
      const normalized = normalizeRating(rating.source, rating.rawValue);
      return { source: rating.source.trim().toUpperCase().replace(/\s+/g, '_'), rawValue: rating.rawValue, ...normalized };
    } catch {
      return null;
    }
  });

  if (normalizedRatingsInput?.some((rating) => rating === null)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'invalid rating source or rawValue format' }, 400);
  }

  const normalizedRatings = normalizedRatingsInput
    ? [...new Map(normalizedRatingsInput.map((rating) => [rating!.source, rating!])).values()]
    : undefined;

  const movie = await prisma.movie.upsert({
    where: { tmdbId },
    create: {
      tmdbId,
      title: title.trim(),
      year: year as number | undefined,
      posterUrl: posterUrl.trim(),
      posterLastValidatedAt: new Date(),
      genres: genres as string[] | undefined,
      ...(normalizedRatings && normalizedRatings.length > 0
        ? {
            ratings: {
              create: normalizedRatings,
            },
          }
        : {}),
    },
    update: {
      title: title.trim(),
      year: year as number | undefined,
      posterUrl: posterUrl.trim(),
      posterLastValidatedAt: new Date(),
      genres: genres as string[] | undefined,
    },
    include: { ratings: true },
  });

  if (normalizedRatings && normalizedRatings.length > 0) {
    await Promise.all(
      normalizedRatings.map((rating) =>
        prisma.movieRating.upsert({
          where: {
            movieId_source: {
              movieId: movie.id,
              source: rating!.source,
            },
          },
          create: {
            movieId: movie.id,
            source: rating!.source,
            value: rating!.value,
            scale: rating!.scale,
            rawValue: rating!.rawValue,
          },
          update: {
            value: rating!.value,
            scale: rating!.scale,
            rawValue: rating!.rawValue,
          },
        }),
      ),
    );
  }

  return ok(movie, { status: 200 });
}
