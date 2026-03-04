import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { buildWatchReason, resolveWatchReasonForFilm } from '@/lib/journey/watch-reason';

function normalizeNodeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '');
}

async function resolveNodeSlugForPack(input: {
  requestedNodeSlug: string;
  userId: string;
  selectedPackId: string;
}): Promise<string | null> {
  const direct = await prisma.journeyNode.findFirst({
    where: {
      packId: input.selectedPackId,
      slug: input.requestedNodeSlug,
    },
    select: { slug: true },
  });
  if (direct) {
    return direct.slug;
  }

  const progress = await prisma.journeyProgress.findFirst({
    where: {
      userId: input.userId,
      packId: input.selectedPackId,
    },
    orderBy: { lastUpdatedAt: 'desc' },
    select: { journeyNode: true },
  });
  const progressSlug = progress?.journeyNode ? normalizeNodeSlug(progress.journeyNode.split('#')[0] ?? progress.journeyNode) : null;
  if (progressSlug) {
    const progressNode = await prisma.journeyNode.findFirst({
      where: {
        packId: input.selectedPackId,
        slug: progressSlug,
      },
      select: { slug: true },
    });
    if (progressNode) {
      return progressNode.slug;
    }
  }

  const firstNode = await prisma.journeyNode.findFirst({
    where: {
      packId: input.selectedPackId,
    },
    orderBy: { orderIndex: 'asc' },
    select: { slug: true },
  });
  return firstNode?.slug ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const nodeSlugRaw = url.searchParams.get('nodeSlug');
  if (!nodeSlugRaw) {
    return fail({ code: 'VALIDATION_ERROR', message: 'nodeSlug is required' }, 400);
  }
  const nodeSlug = normalizeNodeSlug(nodeSlugRaw.split('#')[0] ?? nodeSlugRaw);
  const limit = Math.max(1, Math.min(120, Number.parseInt(url.searchParams.get('limit') ?? '24', 10) || 24));

  const profile = await prisma.userProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      selectedPackId: true,
      selectedPack: {
        select: {
          slug: true,
          season: { select: { slug: true } },
        },
      },
    },
  });
  if (!profile?.selectedPackId) {
    return fail({ code: 'NOT_FOUND', message: 'No selected pack' }, 404);
  }

  const resolvedNodeSlug = await resolveNodeSlugForPack({
    requestedNodeSlug: nodeSlug,
    userId: auth.userId,
    selectedPackId: profile.selectedPackId,
  });
  if (!resolvedNodeSlug) {
    return fail({ code: 'NOT_FOUND', message: 'No journey nodes found for selected pack' }, 404);
  }

  const assignments = await prisma.nodeMovie.findMany({
    where: {
      node: {
        packId: profile.selectedPackId,
        slug: resolvedNodeSlug,
      },
    },
    orderBy: [{ tier: 'asc' }, { coreRank: 'asc' }, { rank: 'asc' }],
    select: {
      tier: true,
      coreRank: true,
      finalScore: true,
      journeyScore: true,
      node: {
        select: {
          slug: true,
          name: true,
          whatToNotice: true,
          eraSubgenreFocus: true,
        },
      },
      movie: {
        select: {
          tmdbId: true,
          title: true,
          year: true,
          posterUrl: true,
          country: true,
          director: true,
        },
      },
    },
  });

  const seasonSlug = profile.selectedPack?.season.slug ?? null;
  const packSlug = profile.selectedPack?.slug ?? null;

  const coreRows = assignments.filter((row) => row.tier === 'CORE').slice(0, limit);
  const coreWatchReasons = await Promise.all(coreRows.map(async (row) => {
    if (!seasonSlug || !packSlug) {
      return buildWatchReason({
        seasonSlug: 'unknown',
        nodeSlug: row.node.slug,
        movieMeta: {
          title: row.movie.title,
          year: row.movie.year,
          country: row.movie.country,
          director: row.movie.director,
        },
        nodeMeta: {
          name: row.node.name,
          whatToNotice: row.node.whatToNotice,
          subgenres: row.node.eraSubgenreFocus
            .split(/[;,]/g)
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
        },
      });
    }
    return resolveWatchReasonForFilm({
      seasonSlug,
      packSlug,
      nodeSlug: row.node.slug,
      tmdbId: row.movie.tmdbId,
    });
  }));
  const core = coreRows.map((row, index) => ({
      tmdbId: row.movie.tmdbId,
      title: row.movie.title,
      year: row.movie.year,
      posterUrl: row.movie.posterUrl,
      coreRank: row.coreRank,
      finalScore: row.finalScore,
      journeyScore: row.journeyScore,
      watchReason: coreWatchReasons[index] ?? undefined,
    }));
  const extendedRows = assignments.filter((row) => row.tier === 'EXTENDED').slice(0, limit);
  const extendedWatchReasons = await Promise.all(extendedRows.map(async (row) => {
    if (!seasonSlug || !packSlug) {
      return buildWatchReason({
        seasonSlug: 'unknown',
        nodeSlug: row.node.slug,
        movieMeta: {
          title: row.movie.title,
          year: row.movie.year,
          country: row.movie.country,
          director: row.movie.director,
        },
        nodeMeta: {
          name: row.node.name,
          whatToNotice: row.node.whatToNotice,
          subgenres: row.node.eraSubgenreFocus
            .split(/[;,]/g)
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
        },
      });
    }
    return resolveWatchReasonForFilm({
      seasonSlug,
      packSlug,
      nodeSlug: row.node.slug,
      tmdbId: row.movie.tmdbId,
    });
  }));
  const extended = extendedRows.map((row, index) => ({
      tmdbId: row.movie.tmdbId,
      title: row.movie.title,
      year: row.movie.year,
      posterUrl: row.movie.posterUrl,
      finalScore: row.finalScore,
      journeyScore: row.journeyScore,
      watchReason: extendedWatchReasons[index] ?? undefined,
    }));

  return ok({
    nodeSlug: resolvedNodeSlug,
    core,
    extended,
  });
}
