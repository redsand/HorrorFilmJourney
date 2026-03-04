import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

export type CreateSeasonNodeReleaseInput = {
  seasonId: string;
  packId: string;
  taxonomyVersion: string;
  runId: string;
  publish: boolean;
  metadata?: Prisma.InputJsonValue;
};

export async function createSeasonNodeReleaseFromNodeMovie(prisma: PrismaClient, input: CreateSeasonNodeReleaseInput): Promise<{ releaseId: string; itemCount: number }> {
  const assignments = await prisma.nodeMovie.findMany({
    where: {
      node: { packId: input.packId },
      taxonomyVersion: input.taxonomyVersion,
    },
    orderBy: [{ node: { orderIndex: 'asc' } }, { rank: 'asc' }],
    select: {
      movieId: true,
      rank: true,
      source: true,
      score: true,
      evidence: true,
      node: { select: { slug: true } },
    },
  });

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

  await prisma.$transaction(async (tx) => {
    await tx.seasonNodeRelease.updateMany({
      where: {
        seasonId: pack.season.id,
        packId: pack.id,
        isPublished: true,
      },
      data: { isPublished: false, publishedAt: null },
    });

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
