import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';

function firstLine(value: string, max = 200): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1).trimEnd()}...`;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const tmdbIdParam = url.searchParams.get('tmdbId');
  const tmdbId = tmdbIdParam ? Number.parseInt(tmdbIdParam, 10) : NaN;
  if (!Number.isInteger(tmdbId)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId is required and must be an integer' }, 400);
  }

  const movie = await prisma.movie.findUnique({
    where: { tmdbId },
    select: { id: true },
  });
  if (!movie) {
    return fail({ code: 'NOT_FOUND', message: 'Movie not found' }, 404);
  }

  const cached = await prisma.companionCache.findUnique({
    where: {
      movieId_spoilerPolicy: {
        movieId: movie.id,
        spoilerPolicy: 'NO_SPOILERS',
      },
    },
    select: { payload: true },
  });
  if (cached?.payload && typeof cached.payload === 'object') {
    const payload = cached.payload as Record<string, unknown>;
    const metadata = payload.metadata;
    if (metadata && typeof metadata === 'object') {
      const tagline = (metadata as Record<string, unknown>).tagline;
      if (typeof tagline === 'string' && tagline.trim().length > 0) {
        return ok({ tagline: firstLine(tagline, 200) });
      }
    }
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return ok({ tagline: null });
  }

  try {
    const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
    detailsUrl.searchParams.set('api_key', apiKey);
    detailsUrl.searchParams.set('language', 'en-US');
    const response = await fetch(detailsUrl.toString(), { method: 'GET' });
    if (!response.ok) {
      return ok({ tagline: null });
    }
    const body = await response.json() as { tagline?: unknown };
    const tagline = typeof body.tagline === 'string' && body.tagline.trim().length > 0
      ? firstLine(body.tagline, 200)
      : null;
    return ok({ tagline });
  } catch {
    return ok({ tagline: null });
  }
}

