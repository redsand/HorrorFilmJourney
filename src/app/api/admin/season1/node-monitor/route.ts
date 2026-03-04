import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { loadSeason1NodeGovernanceConfig, resolvePerNodeMinEligible, resolvePerNodeTargetSize, toPairKey } from '@/lib/nodes/governance';

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const governance = await loadSeason1NodeGovernanceConfig();
  const season = await prisma.season.findUnique({
    where: { slug: 'season-1' },
    select: {
      id: true,
      packs: {
        where: { slug: 'horror' },
        select: {
          id: true,
          nodes: {
            orderBy: { orderIndex: 'asc' },
            select: {
              slug: true,
              name: true,
              movies: {
                select: { movieId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!season || season.packs.length === 0) {
    return fail({ code: 'NOT_FOUND', message: 'Season 1 horror pack not found' }, 404);
  }
  const pack = season.packs[0]!;
  const assignmentByMovie = new Map<string, string[]>();
  const nodeStats = pack.nodes.map((node) => {
    for (const item of node.movies) {
      const list = assignmentByMovie.get(item.movieId) ?? [];
      list.push(node.slug);
      assignmentByMovie.set(item.movieId, list);
    }
    return {
      slug: node.slug,
      name: node.name,
      size: node.movies.length,
      minEligible: resolvePerNodeMinEligible(governance, node.slug),
      targetSize: resolvePerNodeTargetSize(governance, node.slug),
    };
  });

  const horrorMovies = await prisma.movie.findMany({
    select: { id: true, genres: true },
  });
  const horrorCatalog = horrorMovies.filter((movie) => parseGenres(movie.genres).includes('horror'));
  const noNodeCount = horrorCatalog.filter((movie) => !assignmentByMovie.has(movie.id)).length;
  const noNodePct = horrorCatalog.length > 0 ? Number((noNodeCount / horrorCatalog.length).toFixed(4)) : 0;

  const overlapCountByPair = new Map<string, number>();
  for (const slugs of assignmentByMovie.values()) {
    const unique = [...new Set(slugs)].sort();
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const key = toPairKey(unique[i]!, unique[j]!);
        overlapCountByPair.set(key, (overlapCountByPair.get(key) ?? 0) + 1);
      }
    }
  }

  const overlapAnomalies = governance.overlapConstraints.disallowedPairs
    .map(([a, b]) => ({
      pair: [a, b] as [string, string],
      count: overlapCountByPair.get(toPairKey(a, b)) ?? 0,
    }))
    .filter((row) => row.count > 0);

  const published = await prisma.seasonNodeRelease.findFirst({
    where: { seasonId: season.id, packId: pack.id, isPublished: true },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, taxonomyVersion: true, runId: true, publishedAt: true },
  });

  const previousPublished = published
    ? await prisma.seasonNodeRelease.findFirst({
      where: {
        seasonId: season.id,
        packId: pack.id,
        isPublished: false,
        createdAt: { lt: published.publishedAt ?? new Date() },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true, runId: true },
    })
    : null;

  let changedAssignments = 0;
  if (published && previousPublished) {
    const [currentItems, previousItems] = await Promise.all([
      prisma.seasonNodeReleaseItem.findMany({
        where: { releaseId: published.id },
        select: { nodeSlug: true, movieId: true },
      }),
      prisma.seasonNodeReleaseItem.findMany({
        where: { releaseId: previousPublished.id },
        select: { nodeSlug: true, movieId: true },
      }),
    ]);
    const toKey = (nodeSlug: string, movieId: string) => `${nodeSlug}::${movieId}`;
    const currentSet = new Set(currentItems.map((item) => toKey(item.nodeSlug, item.movieId)));
    const previousSet = new Set(previousItems.map((item) => toKey(item.nodeSlug, item.movieId)));
    for (const key of currentSet) {
      if (!previousSet.has(key)) {
        changedAssignments += 1;
      }
    }
    for (const key of previousSet) {
      if (!currentSet.has(key)) {
        changedAssignments += 1;
      }
    }
  }

  return ok({
    taxonomyVersion: governance.taxonomyVersion,
    publishedSnapshot: published,
    nodeStats,
    overlapAnomalies,
    noNodePct,
    noNodeCount,
    horrorCatalogSize: horrorCatalog.length,
    changedAssignmentsFromPrevious: changedAssignments,
  });
}
