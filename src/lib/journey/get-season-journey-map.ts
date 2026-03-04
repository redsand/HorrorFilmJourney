import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { InteractionStatus, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type JourneyMapNode = {
  slug: string;
  name: string;
  order: number;
  coreCount?: number;
  extendedCount?: number;
};

export type SeasonJourneyMap = {
  seasonSlug: string;
  packSlug: string;
  nodes: JourneyMapNode[];
  progress?: {
    completedNodeSlugs: string[];
    currentNodeSlug?: string;
  };
};

type GetSeasonJourneyMapInput = {
  seasonSlug: string;
  packSlug: string;
  userId?: string;
};

type CurriculumNode = { slug?: string; name?: string };

function normalizeJourneyNodeSlug(value: string | null | undefined): string | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  const withoutPackPrefix = value.includes(':') ? value.slice(value.lastIndexOf(':') + 1) : value;
  return withoutPackPrefix.split('#')[0]?.trim().toLowerCase() || undefined;
}

function findCurriculumPath(seasonSlug: string, packSlug: string): string | null {
  const base = resolve(process.cwd(), 'docs', 'season');
  if (!existsSync(base)) {
    return null;
  }
  const prefix = `${seasonSlug}-${packSlug}`.toLowerCase();
  const file = readdirSync(base)
    .filter((name) =>
      name.toLowerCase().startsWith(prefix)
      && name.toLowerCase().includes('curriculum')
      && name.toLowerCase().endsWith('.json'))
    .sort()[0];
  return file ? resolve(base, file) : null;
}

function loadFallbackCurriculumNodes(seasonSlug: string, packSlug: string): JourneyMapNode[] {
  const path = findCurriculumPath(seasonSlug, packSlug);
  if (!path) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { nodes?: CurriculumNode[] };
    const rows = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    return rows
      .map((node, index) => ({
        slug: String(node.slug ?? '').trim().toLowerCase(),
        name: String(node.name ?? node.slug ?? '').trim(),
        order: index + 1,
      }))
      .filter((row) => row.slug.length > 0 && row.name.length > 0);
  } catch {
    return [];
  }
}

async function getSeasonJourneyMapWithClient(db: PrismaClient, input: GetSeasonJourneyMapInput): Promise<SeasonJourneyMap> {
  const pack = await db.genrePack.findFirst({
    where: {
      slug: input.packSlug,
      season: { slug: input.seasonSlug },
    },
    select: { id: true },
  });

  if (!pack) {
    const fallbackNodes = loadFallbackCurriculumNodes(input.seasonSlug, input.packSlug);
    return {
      seasonSlug: input.seasonSlug,
      packSlug: input.packSlug,
      nodes: fallbackNodes,
      ...(input.userId ? { progress: { completedNodeSlugs: [] } } : {}),
    };
  }

  const dbNodes = await db.journeyNode.findMany({
    where: { packId: pack.id },
    orderBy: [{ orderIndex: 'asc' }, { slug: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      orderIndex: true,
    },
  });

  const nodeIds = dbNodes.map((node) => node.id);
  const assignments = nodeIds.length > 0
    ? await db.nodeMovie.findMany({
      where: { nodeId: { in: nodeIds } },
      select: { nodeId: true, tier: true },
    })
    : [];

  const countsByNodeId = new Map<string, { coreCount: number; extendedCount: number }>();
  for (const row of assignments) {
    const current = countsByNodeId.get(row.nodeId) ?? { coreCount: 0, extendedCount: 0 };
    if (row.tier === 'CORE') {
      current.coreCount += 1;
    } else if (row.tier === 'EXTENDED') {
      current.extendedCount += 1;
    }
    countsByNodeId.set(row.nodeId, current);
  }

  const nodes: JourneyMapNode[] = dbNodes.map((node, index) => {
    const counts = countsByNodeId.get(node.id);
    return {
      slug: node.slug,
      name: node.name,
      order: node.orderIndex ?? index + 1,
      ...(counts ? { coreCount: counts.coreCount, extendedCount: counts.extendedCount } : {}),
    };
  });

  if (!input.userId) {
    return { seasonSlug: input.seasonSlug, packSlug: input.packSlug, nodes };
  }

  const watchStatuses: InteractionStatus[] = ['WATCHED', 'ALREADY_SEEN'];
  const interactions = await db.userMovieInteraction.findMany({
    where: {
      userId: input.userId,
      packId: pack.id,
      status: { in: watchStatuses },
    },
    select: { movieId: true },
  });
  const watchedMovieIds = Array.from(new Set(interactions.map((entry) => entry.movieId)));
  const completedNodeSlugs = watchedMovieIds.length > 0
    ? Array.from(new Set((await db.nodeMovie.findMany({
      where: {
        movieId: { in: watchedMovieIds },
        node: { packId: pack.id },
      },
      select: { node: { select: { slug: true } } },
    })).map((row) => row.node.slug)))
    : [];

  const latestProgress = await db.journeyProgress.findFirst({
    where: {
      userId: input.userId,
      packId: pack.id,
    },
    orderBy: { lastUpdatedAt: 'desc' },
    select: { journeyNode: true },
  });

  return {
    seasonSlug: input.seasonSlug,
    packSlug: input.packSlug,
    nodes,
    progress: {
      completedNodeSlugs,
      ...(normalizeJourneyNodeSlug(latestProgress?.journeyNode) ? {
        currentNodeSlug: normalizeJourneyNodeSlug(latestProgress?.journeyNode),
      } : {}),
    },
  };
}

export async function getSeasonJourneyMap(input: GetSeasonJourneyMapInput): Promise<SeasonJourneyMap> {
  return getSeasonJourneyMapWithClient(prisma, input);
}

export const __journeyMapTestUtils = {
  normalizeJourneyNodeSlug,
  getSeasonJourneyMapWithClient,
};
