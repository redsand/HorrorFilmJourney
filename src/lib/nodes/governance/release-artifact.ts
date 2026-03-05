import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { assertCanonicalTaxonomyVersion, getReleaseContract } from './release-contract';

export type CreateSeasonNodeReleaseInput = {
  seasonId: string;
  packId: string;
  taxonomyVersion: string;
  runId: string;
  publish: boolean;
  metadata?: Prisma.InputJsonValue;
};

export async function createSeasonNodeReleaseFromNodeMovie(prisma: PrismaClient, input: CreateSeasonNodeReleaseInput): Promise<{ releaseId: string; itemCount: number }> {
  const pack = await prisma.genrePack.findUnique({
    where: { id: input.packId },
    select: {
      slug: true,
      seasonId: true,
      season: { select: { slug: true } },
    },
  });
  if (!pack) {
    throw new Error('Genre pack not found for release creation');
  }
  if (pack.seasonId !== input.seasonId) {
    throw new Error('Pack/season mismatch when building release');
  }
  const contract = getReleaseContract({ seasonSlug: pack.season.slug, packSlug: pack.slug });
  assertCanonicalTaxonomyVersion(contract, input.taxonomyVersion);

  const assignments = await prisma.nodeMovie.findMany({
    where: {
      node: { packId: input.packId },
      taxonomyVersion: input.taxonomyVersion,
    },
    select: {
      movieId: true,
      rank: true,
      source: true,
      score: true,
      evidence: true,
      tier: true,
      node: { select: { slug: true } },
    },
    orderBy: [{ node: { orderIndex: 'asc' } }, { coreRank: 'asc' }, { rank: 'asc' }],
  });

  if (assignments.some((assignment) => assignment.tier !== 'CORE')) {
    throw new Error(`[release contract] non-CORE assignments detected for ${contract.seasonSlug}/${contract.packSlug}`);
  }

  const release = await prisma.$transaction(async (tx) => {
    if (input.publish) {
      await tx.seasonNodeRelease.updateMany({
        where: {
          seasonId: input.seasonId,
          packId: input.packId,
          isPublished: true,
        },
        data: { isPublished: false, publishedAt: null },
      });
    }

    const created = await tx.seasonNodeRelease.upsert({
      where: {
        packId_taxonomyVersion_runId: {
          packId: input.packId,
          taxonomyVersion: input.taxonomyVersion,
          runId: input.runId,
        },
      },
      create: {
        seasonId: input.seasonId,
        packId: input.packId,
        taxonomyVersion: input.taxonomyVersion,
        runId: input.runId,
        isPublished: input.publish,
        publishedAt: input.publish ? new Date() : null,
        metadata: input.metadata,
      },
      update: {
        isPublished: input.publish,
        publishedAt: input.publish ? new Date() : null,
        metadata: input.metadata,
      },
      select: { id: true },
    });

    await tx.seasonNodeReleaseItem.deleteMany({ where: { releaseId: created.id } });
    if (assignments.length > 0) {
      await tx.seasonNodeReleaseItem.createMany({
        data: assignments.map((assignment) => ({
          releaseId: created.id,
          nodeSlug: assignment.node.slug,
          movieId: assignment.movieId,
          rank: assignment.rank,
          source: assignment.source,
          score: assignment.score,
          evidence: assignment.evidence === null
            ? Prisma.JsonNull
            : assignment.evidence as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  return { releaseId: release.id, itemCount: assignments.length };
}

export async function publishSeasonNodeRelease(prisma: PrismaClient, input: {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion?: string;
  runId?: string;
}): Promise<{ releaseId: string; runId: string; taxonomyVersion: string }> {
  const pack = await prisma.genrePack.findUnique({
    where: { slug: input.packSlug },
    select: { id: true, season: { select: { id: true, slug: true } } },
  });

  if (!pack || pack.season.slug !== input.seasonSlug) {
    throw new Error(`Pack ${input.packSlug} is not linked to season ${input.seasonSlug}`);
  }

  const candidate = await prisma.seasonNodeRelease.findFirst({
    where: {
      seasonId: pack.season.id,
      packId: pack.id,
      ...(input.taxonomyVersion ? { taxonomyVersion: input.taxonomyVersion } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    select: { id: true, runId: true, taxonomyVersion: true },
  });

  if (!candidate) {
    throw new Error('No matching season node release snapshot found to publish');
  }

  const contract = getReleaseContract({ seasonSlug: input.seasonSlug, packSlug: input.packSlug });
  assertCanonicalTaxonomyVersion(contract, candidate.taxonomyVersion);

  await prisma.$transaction(async (tx) => {
    await tx.seasonNodeRelease.updateMany({
      where: {
        seasonId: pack.season.id,
        packId: pack.id,
        isPublished: true,
      },
      data: { isPublished: false, publishedAt: null },
    });

    await ensureReleaseItemsOnlyCore(tx, candidate.id, candidate.taxonomyVersion);

    await tx.seasonNodeRelease.update({
      where: { id: candidate.id },
      data: { isPublished: true, publishedAt: new Date() },
    });
  });

  return { releaseId: candidate.id, runId: candidate.runId, taxonomyVersion: candidate.taxonomyVersion };
}

export async function getPublishedSeasonNodeReleaseId(prisma: PrismaClient, input: {
  packId: string;
  seasonSlug: string;
}): Promise<string | null> {
  const pack = await prisma.genrePack.findUnique({
    where: { id: input.packId },
    select: { season: { select: { slug: true } } },
  });
  if (!pack || pack.season.slug !== input.seasonSlug) {
    return null;
  }

  const release = await prisma.seasonNodeRelease.findFirst({
    where: {
      packId: input.packId,
      isPublished: true,
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });

  return release?.id ?? null;
}

async function ensureReleaseItemsOnlyCore(
  tx: PrismaClient | Prisma.TransactionClient,
  releaseId: string,
  taxonomyVersion: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "SeasonNodeReleaseItem" item
    JOIN "NodeMovie" nm ON nm."movieId" = item."movieId"
    JOIN "JourneyNode" node ON node."id" = nm."nodeId"
    WHERE item."releaseId" = ${releaseId}
      AND nm."taxonomyVersion" = ${taxonomyVersion}
      AND node."slug" = item."nodeSlug"
      AND nm."tier" != 'CORE'
  `);
  const row = rows[0];
  const count = row?.count ?? BigInt(0);

  if (Number(count) > 0) {
    throw new Error(
      `[release contract] release ${releaseId} contains ${count} EXTENDED assignments for taxonomy ${taxonomyVersion}`,
    );
  }
}
