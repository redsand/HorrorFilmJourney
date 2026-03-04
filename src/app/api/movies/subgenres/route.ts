import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { getPublishedSeason1NodesForMovie } from '@/lib/nodes/published-snapshot';

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

  const effectivePack = await resolveEffectivePackForUser(prisma, auth.userId);
  if (!effectivePack.packId) {
    return ok({ subgenres: [] });
  }

  const nodes = await getPublishedSeason1NodesForMovie(prisma, {
    packId: effectivePack.packId,
    movieId: movie.id,
  });

  return ok({ subgenres: nodes.map((node) => node.nodeName) });
}
