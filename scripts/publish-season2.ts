import { PrismaClient } from '@prisma/client';
import { createSeasonNodeReleaseFromNodeMovie, publishSeasonNodeRelease } from '../src/lib/nodes/governance/release-artifact.ts';
import { getReleaseContract } from '../src/lib/nodes/governance/release-contract.ts';
import { enforceSnapshotGuardrail } from '../src/lib/audit/snapshot-db-divergence.ts';

type CliOptions = {
  apply: boolean;
  force: boolean;
  enforceBalance: boolean;
  activateSeason: boolean;
  migrateProfiles: boolean;
};

function parseCliArgs(): CliOptions {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has('--apply'),
    force: args.has('--force'),
    enforceBalance: process.env.SEASON2_ENFORCE_BALANCE === 'true',
    activateSeason: args.has('--activate-season'),
    migrateProfiles: args.has('--migrate-profiles'),
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const prisma = new PrismaClient();
  const contract = getReleaseContract({ seasonSlug: 'season-2', packSlug: 'cult-classics' });
  const envTaxonomyVersion = process.env.SEASON2_TAXONOMY_VERSION?.trim();
  if (envTaxonomyVersion && envTaxonomyVersion !== contract.taxonomyVersion) {
    throw new Error(`Season 2 publishes must use taxonomyVersion ${contract.taxonomyVersion}`);
  }
  const taxonomyVersion = envTaxonomyVersion ?? contract.taxonomyVersion;
  const runId = process.env.SEASON2_ASSIGNMENT_RUN_ID?.trim() || `season2-curated-${new Date().toISOString()}`;

  try {
    const season2 = await prisma.season.findUnique({
      where: { slug: 'season-2' },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
      },
    });
    if (!season2) {
      throw new Error('season-2 not found. Seed seasons before publish.');
    }

    const cultPack = await prisma.genrePack.findUnique({
      where: { slug: 'cult-classics' },
      select: {
        id: true,
        slug: true,
        name: true,
        seasonId: true,
        isEnabled: true,
      },
    });
    if (!cultPack || cultPack.seasonId !== season2.id) {
      throw new Error('cult-classics pack is missing or not linked to season-2.');
    }

    const nodes = await prisma.journeyNode.findMany({
      where: { packId: cultPack.id },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        movies: {
          select: {
            movie: {
              select: {
                title: true,
                year: true,
              },
            },
          },
        },
        _count: { select: { movies: true } },
      },
    });

    if (nodes.length === 0 && !options.force) {
      throw new Error('Expected at least one JourneyNode for cult-classics, found none. Use --force to override.');
    }

    const nodeCounts = nodes.map((node) => ({
      slug: node.slug,
      name: node.name,
      count: node._count.movies,
    }));

    const minCount = nodeCounts.reduce((acc, node) => Math.min(acc, node.count), Number.MAX_SAFE_INTEGER);
    const maxCount = nodeCounts.reduce((acc, node) => Math.max(acc, node.count), 0);
    const spread = nodeCounts.length > 0 ? maxCount - minCount : 0;
    if (options.enforceBalance && spread > 0 && !options.force) {
      throw new Error(
        `Season 2 balance gate failed (node spread ${spread}). Set SEASON2_ENFORCE_BALANCE=false to allow imbalance, or use --force.`,
      );
    }

    const assignmentTotal = nodeCounts.reduce((sum, node) => sum + node.count, 0);
    if (assignmentTotal === 0 && !options.force) {
      throw new Error('Season 2 has zero assignments. Seed/import node movies before publish, or use --force.');
    }
    console.log(
      `[season2.publish] readiness: nodes=${nodes.length} assignments=${assignmentTotal} enforceBalance=${options.enforceBalance} spread=${spread}`,
    );
    nodeCounts.forEach((node) => {
      console.log(`[season2.publish] node ${node.slug}: ${node.count}`);
    });

    if (!options.apply) {
      console.log(`[season2.publish] dry run only. Re-run with --apply to publish snapshot and enable cult-classics (taxonomyVersion=${taxonomyVersion}).`);
      return;
    }

    const release = await createSeasonNodeReleaseFromNodeMovie(prisma, {
      seasonId: season2.id,
      packId: cultPack.id,
      taxonomyVersion,
      runId,
      publish: false,
      metadata: {
        source: 'publish-season2',
        mode: 'curation-first',
        assignmentTotal,
      },
    });

    await enforceSnapshotGuardrail(prisma, {
      seasonSlug: 'season-2',
      packSlug: 'cult-classics',
      taxonomyVersion,
      releaseId: release.releaseId,
    });

    const published = await publishSeasonNodeRelease(prisma, {
      seasonSlug: 'season-2',
      packSlug: 'cult-classics',
      taxonomyVersion,
      runId,
    });

    await prisma.genrePack.update({
      where: { id: cultPack.id },
      data: { isEnabled: true },
    });

    if (options.activateSeason) {
      await prisma.$transaction(async (tx) => {
        await tx.season.updateMany({
          data: { isActive: false },
        });
        await tx.season.update({
          where: { id: season2.id },
          data: { isActive: true },
        });
      });
    }

    let updatedProfiles = 0;
    if (options.migrateProfiles) {
      const profiles = await prisma.userProfile.findMany({
        select: {
          id: true,
          selectedPackId: true,
          selectedPack: {
            select: {
              id: true,
              season: { select: { isActive: true } },
            },
          },
        },
      });

      for (const profile of profiles) {
        const shouldMove = !profile.selectedPackId || !profile.selectedPack || !profile.selectedPack.season.isActive;
        if (!shouldMove) {
          continue;
        }
        await prisma.userProfile.update({
          where: { id: profile.id },
          data: { selectedPackId: cultPack.id },
        });
        updatedProfiles += 1;
      }
    }

    console.log(
      `[season2.publish] published: pack=cult-classics seasonActivated=${options.activateSeason} profilesUpdated=${updatedProfiles} releaseId=${published.releaseId} runId=${published.runId} taxonomyVersion=${published.taxonomyVersion} coreItems=${release.itemCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[season2.publish] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
