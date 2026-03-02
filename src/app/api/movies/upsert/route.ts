import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
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

  const { tmdbId, title, year, posterUrl, genres } = body as Record<string, unknown>;

  if (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId) || typeof title !== 'string' || title.trim().length === 0) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId (number) and title (string) are required' }, 400);
  }

  if (year !== undefined && (typeof year !== 'number' || !Number.isInteger(year))) {
    return fail({ code: 'VALIDATION_ERROR', message: 'year must be an integer when provided' }, 400);
  }

  if (posterUrl !== undefined && typeof posterUrl !== 'string') {
    return fail({ code: 'VALIDATION_ERROR', message: 'posterUrl must be a string when provided' }, 400);
  }

  if (genres !== undefined && !isStringArray(genres)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'genres must be an array of strings when provided' }, 400);
  }

  const movie = await prisma.movie.upsert({
    where: { tmdbId },
    create: {
      tmdbId,
      title: title.trim(),
      year: year as number | undefined,
      posterUrl: posterUrl as string | undefined,
      genres: genres as string[] | undefined,
    },
    update: {
      title: title.trim(),
      year: year as number | undefined,
      posterUrl: posterUrl as string | undefined,
      genres: genres as string[] | undefined,
    },
  });

  return ok(movie, { status: 200 });
}
