import { PrismaClient } from '@prisma/client';

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

async function main(): Promise<void> {
  const databaseUrl = env('DATABASE_URL');
  const inspectUserId = optionalEnv('SEASON1_CHECK_USER_ID');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const checks: Check[] = [];
  try {
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, slug: true, name: true },
    });

    const season = await prisma.season.findUnique({
      where: { slug: 'season-1' },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        packs: {
          where: { slug: 'horror' },
          select: {
            id: true,
            slug: true,
            name: true,
            isEnabled: true,
            primaryGenre: true,
          },
        },
      },
    });

    checks.push({
      name: 'season-1 exists',
      ok: Boolean(season),
      detail: season ? `id=${season.id}` : 'missing',
    });

    const pack = season?.packs[0] ?? null;
    checks.push({
      name: 'season-1 horror pack exists',
      ok: Boolean(pack),
      detail: pack ? `id=${pack.id}` : 'missing',
    });
    checks.push({
      name: 'season-1 horror pack enabled',
      ok: Boolean(pack?.isEnabled),
      detail: pack ? `isEnabled=${pack.isEnabled}` : 'n/a',
    });

    let release: { id: string; runId: string; taxonomyVersion: string; publishedAt: Date | null } | null = null;
    let releaseItemsCount = 0;
    let perNode: Array<{ nodeSlug: string; _count: { _all: number } }> = [];
    let nodeCount = 0;
    let nodeMovieCoreCount = 0;
    let releaseMatchesNodeMovieCore = false;

    if (season && pack) {
      release = await prisma.seasonNodeRelease.findFirst({
        where: {
          seasonId: season.id,
          packId: pack.id,
          isPublished: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, runId: true, taxonomyVersion: true, publishedAt: true },
      });

      if (release) {
        releaseItemsCount = await prisma.seasonNodeReleaseItem.count({
          where: { releaseId: release.id },
        });

        perNode = await prisma.seasonNodeReleaseItem.groupBy({
          by: ['nodeSlug'],
          where: { releaseId: release.id },
          _count: { _all: true },
          orderBy: { nodeSlug: 'asc' },
        });
      }

      nodeCount = await prisma.journeyNode.count({
        where: { packId: pack.id },
      });

      nodeMovieCoreCount = await prisma.nodeMovie.count({
        where: {
          tier: 'CORE',
          node: { packId: pack.id },
        },
      });

      if (release) {
        const nodeMovieCoreForRun = await prisma.nodeMovie.count({
          where: {
            tier: 'CORE',
            runId: release.runId,
            taxonomyVersion: release.taxonomyVersion,
            node: { packId: pack.id },
          },
        });
        releaseMatchesNodeMovieCore = nodeMovieCoreForRun === releaseItemsCount;
      }
    }

    checks.push({
      name: 'published season-1 release exists',
      ok: Boolean(release),
      detail: release ? `releaseId=${release.id} runId=${release.runId}` : 'none',
    });
    checks.push({
      name: 'published release has items',
      ok: release ? releaseItemsCount > 0 : false,
      detail: `releaseItems=${releaseItemsCount}`,
    });
    checks.push({
      name: 'journey node count is 16',
      ok: nodeCount === 16,
      detail: `nodes=${nodeCount}`,
    });
    checks.push({
      name: 'nodeMovie CORE rows exist',
      ok: nodeMovieCoreCount > 0,
      detail: `nodeMovieCore=${nodeMovieCoreCount}`,
    });
    checks.push({
      name: 'release item count matches nodeMovie CORE count for published run',
      ok: release ? releaseMatchesNodeMovieCore : false,
      detail: release ? `match=${releaseMatchesNodeMovieCore}` : 'n/a',
    });

    const nodeWithoutItems = nodeCount - perNode.length;
    checks.push({
      name: 'published release covers all nodes',
      ok: release ? nodeWithoutItems <= 0 : false,
      detail: release ? `nodesWithItems=${perNode.length} missingNodes=${Math.max(0, nodeWithoutItems)}` : 'n/a',
    });

    let userSummary: Record<string, unknown> | null = null;
    if (inspectUserId && pack) {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: inspectUserId },
        select: {
          userId: true,
          selectedPackId: true,
          selectedPack: { select: { slug: true, season: { select: { slug: true } } } },
        },
      });
      const latestBatch = await prisma.recommendationBatch.findFirst({
        where: { userId: inspectUserId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          packId: true,
          journeyNode: true,
          createdAt: true,
          items: { select: { id: true }, take: 10 },
        },
      });
      userSummary = {
        userId: inspectUserId,
        selectedPackId: profile?.selectedPackId ?? null,
        selectedPack: profile?.selectedPack
          ? { slug: profile.selectedPack.slug, seasonSlug: profile.selectedPack.season.slug }
          : null,
        latestBatch: latestBatch
          ? {
            id: latestBatch.id,
            packId: latestBatch.packId,
            journeyNode: latestBatch.journeyNode,
            createdAt: latestBatch.createdAt.toISOString(),
            itemCount: latestBatch.items.length,
          }
          : null,
      };
    }

    const failed = checks.filter((check) => !check.ok);
    const output = {
      generatedAt: new Date().toISOString(),
      activeSeason,
      season1: season
        ? {
          id: season.id,
          slug: season.slug,
          name: season.name,
          isActive: season.isActive,
        }
        : null,
      horrorPack: pack
        ? {
          id: pack.id,
          slug: pack.slug,
          name: pack.name,
          isEnabled: pack.isEnabled,
          primaryGenre: pack.primaryGenre,
        }
        : null,
      publishedRelease: release
        ? {
          id: release.id,
          runId: release.runId,
          taxonomyVersion: release.taxonomyVersion,
          publishedAt: release.publishedAt?.toISOString() ?? null,
        }
        : null,
      releaseItems: {
        total: releaseItemsCount,
        perNode: perNode.map((row) => ({ nodeSlug: row.nodeSlug, count: row._count._all })),
      },
      checks,
      failedCount: failed.length,
      userSummary,
    };

    console.log(JSON.stringify(output, null, 2));

    if (failed.length > 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[check-season1-health] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
