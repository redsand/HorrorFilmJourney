import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

type GovernanceFile = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
};

type CliOptions = {
  apply: boolean;
  force: boolean;
  activateSeason: boolean;
  migrateProfiles: boolean;
};

const GOVERNANCE_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-node-governance.json');

function parseCliArgs(): CliOptions {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has('--apply'),
    force: args.has('--force'),
    activateSeason: args.has('--activate-season'),
    migrateProfiles: args.has('--migrate-profiles'),
  };
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const minPerNode = parseIntEnv('SEASON3_MIN_PER_NODE', 20);
  const prisma = new PrismaClient();

  try {
    const governance = JSON.parse(await fs.readFile(GOVERNANCE_PATH, 'utf8')) as GovernanceFile;
    const taxonomyVersion = process.env.SEASON3_TAXONOMY_VERSION?.trim() || governance.taxonomyVersion;
    const runId = process.env.SEASON3_ASSIGNMENT_RUN_ID?.trim() || `season3-curated-${new Date().toISOString()}`;

    const season = await prisma.season.findUnique({
      where: { slug: governance.seasonSlug },
      select: { id: true, slug: true, isActive: true },
    });
    if (!season) {
      throw new Error(`Season ${governance.seasonSlug} not found.`);
    }
    const pack = await prisma.genrePack.findUnique({
      where: { slug: governance.packSlug },
      select: { id: true, slug: true, seasonId: true, isEnabled: true },
    });
    if (!pack || pack.seasonId !== season.id) {
      throw new Error(`Pack ${governance.packSlug} is missing or not linked to ${governance.seasonSlug}.`);
    }

    const nodes = await prisma.journeyNode.findMany({
      where: { packId: pack.id, taxonomyVersion },
      include: {
        _count: {
          select: {
            movies: {
              where: {
                taxonomyVersion,
                tier: 'CORE',
              },
            },
          },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });
    if (nodes.length === 0 && !options.force) {
      throw new Error(`No JourneyNode rows found for ${governance.seasonSlug}/${governance.packSlug} (${taxonomyVersion}).`);
    }

    const belowFloor = nodes.filter((node) => node._count.movies < minPerNode);
    if (belowFloor.length > 0 && !options.force) {
      const preview = belowFloor.slice(0, 8).map((node) => `${node.slug}:${node._count.movies}`).join(', ');
      throw new Error(`Node floor gate failed (<${minPerNode}): ${preview}`);
    }

    const coreAssignments = await prisma.nodeMovie.findMany({
      where: {
        node: { packId: pack.id },
        taxonomyVersion,
        tier: 'CORE',
      },
      include: {
        node: { select: { slug: true, orderIndex: true } },
      },
      orderBy: [{ node: { orderIndex: 'asc' } }, { coreRank: 'asc' }, { rank: 'asc' }],
    });
    if (coreAssignments.length === 0 && !options.force) {
      throw new Error('No CORE node assignments found to publish.');
    }

    console.log(`[season3.publish] readiness: nodes=${nodes.length} coreAssignments=${coreAssignments.length} taxonomy=${taxonomyVersion}`);
    for (const node of nodes) {
      console.log(`[season3.publish] node ${node.slug}: ${node._count.movies}`);
    }

    if (!options.apply) {
      console.log('[season3.publish] dry run only. Re-run with --apply to publish.');
      return;
    }

    const release = await prisma.$transaction(async (tx) => {
      await tx.seasonNodeRelease.updateMany({
        where: { seasonId: season.id, packId: pack.id, isPublished: true },
        data: { isPublished: false, publishedAt: null },
      });

      const created = await tx.seasonNodeRelease.upsert({
        where: {
          packId_taxonomyVersion_runId: {
            packId: pack.id,
            taxonomyVersion,
            runId,
          },
        },
        create: {
          seasonId: season.id,
          packId: pack.id,
          taxonomyVersion,
          runId,
          isPublished: true,
          publishedAt: new Date(),
          metadata: {
            source: 'publish-season3',
            assignmentTotal: coreAssignments.length,
          },
        },
        update: {
          isPublished: true,
          publishedAt: new Date(),
          metadata: {
            source: 'publish-season3',
            assignmentTotal: coreAssignments.length,
          },
        },
        select: { id: true },
      });

      await tx.seasonNodeReleaseItem.deleteMany({ where: { releaseId: created.id } });
      if (coreAssignments.length > 0) {
        await tx.seasonNodeReleaseItem.createMany({
          data: coreAssignments.map((assignment) => ({
            releaseId: created.id,
            nodeSlug: assignment.node.slug,
            movieId: assignment.movieId,
            rank: assignment.rank,
            source: assignment.source,
            score: assignment.score,
            evidence: assignment.evidence === null ? Prisma.JsonNull : assignment.evidence as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
      }

      return created.id;
    });

    await prisma.genrePack.update({
      where: { id: pack.id },
      data: { isEnabled: true },
    });

    if (options.activateSeason) {
      await prisma.$transaction(async (tx) => {
        await tx.season.updateMany({ data: { isActive: false } });
        await tx.season.update({ where: { id: season.id }, data: { isActive: true } });
      });
    }

    let updatedProfiles = 0;
    if (options.migrateProfiles) {
      const profiles = await prisma.userProfile.findMany({
        select: {
          id: true,
          selectedPackId: true,
          selectedPack: { select: { season: { select: { isActive: true } } } },
        },
      });
      for (const profile of profiles) {
        const shouldMove = !profile.selectedPackId || !profile.selectedPack || !profile.selectedPack.season.isActive;
        if (!shouldMove) continue;
        // eslint-disable-next-line no-await-in-loop
        await prisma.userProfile.update({
          where: { id: profile.id },
          data: { selectedPackId: pack.id },
        });
        updatedProfiles += 1;
      }
    }

    console.log(
      `[season3.publish] published: releaseId=${release} runId=${runId} taxonomyVersion=${taxonomyVersion} activateSeason=${options.activateSeason} profilesUpdated=${updatedProfiles}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[season3.publish] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

