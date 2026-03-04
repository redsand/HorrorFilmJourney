import type { PrismaClient } from '@prisma/client';
import { getPublishedSeasonNodeReleaseId } from '@/lib/nodes/governance';

export type PublishedMovieNode = {
  nodeSlug: string;
  nodeName: string;
  source: string;
  score: number | null;
  rationale: string;
};

function rationaleFor(source: string, score: number | null): string {
  if (source === 'curated') {
    return 'Curated by curriculum editors.';
  }
  if (source === 'override') {
    return 'Approved by admin override.';
  }
  if (source === 'ml') {
    return typeof score === 'number'
      ? `Approved model-assisted match (confidence ${score.toFixed(2)}).`
      : 'Approved model-assisted match.';
  }
  if (source === 'weak_supervision') {
    return typeof score === 'number'
      ? `Approved automated match (confidence ${score.toFixed(2)}).`
      : 'Approved automated match.';
  }
  return 'Approved assignment.';
}

export async function getPublishedNodesForMovie(
  prisma: PrismaClient,
  input: { packId: string; seasonSlug: string; movieId: string },
): Promise<PublishedMovieNode[]> {
  const releaseId = await getPublishedSeasonNodeReleaseId(prisma, {
    packId: input.packId,
    seasonSlug: input.seasonSlug,
  });
  if (!releaseId) {
    return [];
  }

  const nodeNameBySlug = new Map(
    (await prisma.journeyNode.findMany({
      where: { packId: input.packId },
      select: { slug: true, name: true },
    })).map((row) => [row.slug, row.name] as const),
  );

  const items = await prisma.seasonNodeReleaseItem.findMany({
    where: {
      releaseId,
      movieId: input.movieId,
    },
    orderBy: [{ rank: 'asc' }, { nodeSlug: 'asc' }],
    select: {
      nodeSlug: true,
      source: true,
      score: true,
    },
  });

  return items.map((item) => ({
    nodeSlug: item.nodeSlug,
    nodeName: nodeNameBySlug.get(item.nodeSlug) ?? item.nodeSlug,
    source: item.source,
    score: item.score,
    rationale: rationaleFor(item.source, item.score),
  }));
}

export async function getPublishedReleaseSummaries(prisma: PrismaClient, input: { packId: string; limit?: number }): Promise<Array<{
  id: string;
  taxonomyVersion: string;
  runId: string;
  isPublished: boolean;
  createdAt: Date;
  publishedAt: Date | null;
}>> {
  const rows = await prisma.seasonNodeRelease.findMany({
    where: { packId: input.packId },
    orderBy: [{ createdAt: 'desc' }],
    take: input.limit ?? 5,
    select: {
      id: true,
      taxonomyVersion: true,
      runId: true,
      isPublished: true,
      createdAt: true,
      publishedAt: true,
    },
  });

  return rows;
}

export async function getPublishedSeason1NodesForMovie(
  prisma: PrismaClient,
  input: { packId: string; movieId: string },
): Promise<PublishedMovieNode[]> {
  return getPublishedNodesForMovie(prisma, {
    ...input,
    seasonSlug: 'season-1',
  });
}

export async function getPublishedSeason1ReleaseSummaries(
  prisma: PrismaClient,
  input: { packId: string; limit?: number },
): Promise<Array<{
  id: string;
  taxonomyVersion: string;
  runId: string;
  isPublished: boolean;
  createdAt: Date;
  publishedAt: Date | null;
}>> {
  return getPublishedReleaseSummaries(prisma, input);
}
