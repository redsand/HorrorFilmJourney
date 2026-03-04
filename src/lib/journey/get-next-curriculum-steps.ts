import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { InteractionStatus, NodeAssignmentTier, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type NextCurriculumFilm = {
  tmdbId: number;
  title: string;
  year: number | null;
};

export type NextCurriculumSteps = {
  nextCore: NextCurriculumFilm[];
  nextExtended: NextCurriculumFilm[];
  reason: string;
};

type GetNextCurriculumStepsInput = {
  seasonSlug: string;
  packSlug: string;
  tmdbId: number;
  userId?: string;
};

type SeasonSignals = {
  canonRank?: number;
  confidence?: number;
};

type AssignmentRow = {
  tmdbId: number;
  title: string;
  year: number | null;
  nodeSlug: string;
  nodeName: string;
  nodeOrder: number;
  tier: NodeAssignmentTier;
  coreRank: number | null;
  rank: number;
  finalScore: number;
  journeyScore: number;
  evidence: Prisma.JsonValue | null;
};

type NodeRow = {
  slug: string;
  name: string;
  order: number;
};

type SeasonArtifacts = {
  confidenceByKey: Map<string, number>;
  canonByKey: Map<string, number>;
};

const seasonArtifactCache = new Map<string, SeasonArtifacts>();

function normalizeKey(input: { title: string; year?: number | null }): string {
  const normalizedTitle = input.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const year = typeof input.year === 'number' ? String(input.year) : 'unknown';
  return `${normalizedTitle}|${year}`;
}

function safeReadJson(path: string | null): unknown {
  if (!path) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function findSeasonFile(seasonSlug: string, marker: string): string | null {
  const base = resolve(process.cwd(), 'docs', 'season');
  if (!existsSync(base)) {
    return null;
  }
  const match = readdirSync(base)
    .filter((name) =>
      name.toLowerCase().startsWith(seasonSlug.toLowerCase())
      && name.toLowerCase().includes(marker.toLowerCase())
      && name.toLowerCase().endsWith('.json'))
    .sort()[0];
  return match ? resolve(base, match) : null;
}

function loadSeasonArtifacts(seasonSlug: string): SeasonArtifacts {
  const cached = seasonArtifactCache.get(seasonSlug);
  if (cached) {
    return cached;
  }

  const confidenceByKey = new Map<string, number>();
  const canonByKey = new Map<string, number>();

  const confidencePayload = safeReadJson(findSeasonFile(seasonSlug, 'confidence')) as {
    films?: Array<{ title?: string; year?: number; cultConfidenceScore?: number }>;
  } | null;
  for (const row of confidencePayload?.films ?? []) {
    if (typeof row.title !== 'string' || typeof row.cultConfidenceScore !== 'number') {
      continue;
    }
    confidenceByKey.set(normalizeKey({ title: row.title, year: row.year }), row.cultConfidenceScore);
  }

  const canonPayload = safeReadJson(findSeasonFile(seasonSlug, 'canon')) as {
    top50?: Array<{ title?: string; year?: number; rank?: number }>;
    top100?: Array<{ title?: string; year?: number; rank?: number }>;
    top250?: Array<{ title?: string; year?: number; rank?: number }>;
  } | null;
  const canonRows = [...(canonPayload?.top50 ?? []), ...(canonPayload?.top100 ?? []), ...(canonPayload?.top250 ?? [])];
  for (const row of canonRows) {
    if (typeof row.title !== 'string' || typeof row.rank !== 'number') {
      continue;
    }
    canonByKey.set(normalizeKey({ title: row.title, year: row.year }), row.rank);
  }

  const result = { confidenceByKey, canonByKey };
  seasonArtifactCache.set(seasonSlug, result);
  return result;
}

function extractVoteCount(evidence: Prisma.JsonValue | null): number {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return -1;
  }
  const record = evidence as Record<string, unknown>;
  const direct = [record.voteCount, record.tmdbVoteCount, record.votes]
    .find((value) => typeof value === 'number' && Number.isFinite(value)) as number | undefined;
  if (typeof direct === 'number') {
    return direct;
  }
  const nested = record.journey;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedRecord = nested as Record<string, unknown>;
    const nestedVote = [nestedRecord.voteCount, nestedRecord.tmdbVoteCount]
      .find((value) => typeof value === 'number' && Number.isFinite(value)) as number | undefined;
    if (typeof nestedVote === 'number') {
      return nestedVote;
    }
  }
  return -1;
}

function buildSignal(row: AssignmentRow, artifacts: SeasonArtifacts): SeasonSignals {
  const key = normalizeKey({ title: row.title, year: row.year });
  return {
    canonRank: artifacts.canonByKey.get(key),
    confidence: artifacts.confidenceByKey.get(key),
  };
}

function season2Comparator(a: AssignmentRow, b: AssignmentRow, artifacts: SeasonArtifacts): number {
  const signalA = buildSignal(a, artifacts);
  const signalB = buildSignal(b, artifacts);
  const rankA = signalA.canonRank ?? Number.POSITIVE_INFINITY;
  const rankB = signalB.canonRank ?? Number.POSITIVE_INFINITY;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  const confA = signalA.confidence ?? Number.NEGATIVE_INFINITY;
  const confB = signalB.confidence ?? Number.NEGATIVE_INFINITY;
  if (confA !== confB) {
    return confB - confA;
  }
  const votesA = extractVoteCount(a.evidence);
  const votesB = extractVoteCount(b.evidence);
  if (votesA !== votesB) {
    return votesB - votesA;
  }
  const titleCmp = a.title.localeCompare(b.title);
  if (titleCmp !== 0) {
    return titleCmp;
  }
  return a.tmdbId - b.tmdbId;
}

function season1Comparator(a: AssignmentRow, b: AssignmentRow): number {
  const coreA = a.coreRank ?? Number.POSITIVE_INFINITY;
  const coreB = b.coreRank ?? Number.POSITIVE_INFINITY;
  if (coreA !== coreB) {
    return coreA - coreB;
  }
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }
  if (a.finalScore !== b.finalScore) {
    return b.finalScore - a.finalScore;
  }
  const votesA = extractVoteCount(a.evidence);
  const votesB = extractVoteCount(b.evidence);
  if (votesA !== votesB) {
    return votesB - votesA;
  }
  const titleCmp = a.title.localeCompare(b.title);
  if (titleCmp !== 0) {
    return titleCmp;
  }
  return a.tmdbId - b.tmdbId;
}

function toFilm(rows: AssignmentRow[]): NextCurriculumFilm[] {
  return rows.map((row) => ({ tmdbId: row.tmdbId, title: row.title, year: row.year }));
}

function pickUnwatched(rows: AssignmentRow[], watched: Set<number>, take = 3): AssignmentRow[] {
  return rows.filter((row) => !watched.has(row.tmdbId)).slice(0, take);
}

function buildDeterministicOrder(
  seasonSlug: string,
  rows: AssignmentRow[],
  artifacts: SeasonArtifacts,
): AssignmentRow[] {
  const copy = [...rows];
  if (seasonSlug === 'season-2') {
    copy.sort((a, b) => season2Comparator(a, b, artifacts));
    return copy;
  }
  copy.sort(season1Comparator);
  return copy;
}

function findNextNode(nodes: NodeRow[], currentNodeSlug: string): NodeRow | undefined {
  const ordered = [...nodes].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  const index = ordered.findIndex((node) => node.slug === currentNodeSlug);
  return index >= 0 ? ordered[index + 1] : undefined;
}

function selectNextSteps(input: {
  seasonSlug: string;
  currentTmdbId: number;
  currentNodeSlug: string;
  currentNodeName: string;
  rows: AssignmentRow[];
  nodes: NodeRow[];
  watchedTmdbIds: Set<number>;
  artifacts: SeasonArtifacts;
}): NextCurriculumSteps {
  const currentNodeRows = input.rows.filter((row) => row.nodeSlug === input.currentNodeSlug);
  const currentCoreOrdered = buildDeterministicOrder(
    input.seasonSlug,
    currentNodeRows.filter((row) => row.tier === 'CORE'),
    input.artifacts,
  );
  const currentExtendedOrdered = buildDeterministicOrder(
    input.seasonSlug,
    currentNodeRows.filter((row) => row.tier === 'EXTENDED'),
    input.artifacts,
  );

  const currentCoreIndex = currentCoreOrdered.findIndex((row) => row.tmdbId === input.currentTmdbId);
  const coreAfterCurrent = currentCoreIndex >= 0
    ? currentCoreOrdered.slice(currentCoreIndex + 1)
    : currentCoreOrdered;
  let primaryCore = pickUnwatched(coreAfterCurrent, input.watchedTmdbIds, 3);
  if (primaryCore.length === 0) {
    const fallbackCore = currentCoreOrdered.filter((row) => row.tmdbId !== input.currentTmdbId);
    primaryCore = pickUnwatched(fallbackCore, input.watchedTmdbIds, 3);
  }
  if (primaryCore.length > 0) {
    return {
      nextCore: toFilm(primaryCore),
      nextExtended: [],
      reason: `Next core film in ${input.currentNodeName}.`,
    };
  }

  const nextNode = findNextNode(input.nodes, input.currentNodeSlug);
  const extendedDeepCuts = pickUnwatched(currentExtendedOrdered, input.watchedTmdbIds, 3);

  if (nextNode) {
    const nextNodeCore = buildDeterministicOrder(
      input.seasonSlug,
      input.rows.filter((row) => row.nodeSlug === nextNode.slug && row.tier === 'CORE'),
      input.artifacts,
    );
    const nextNodeCoreUnwatched = pickUnwatched(nextNodeCore, input.watchedTmdbIds, 3);
    if (nextNodeCoreUnwatched.length > 0) {
      return {
        nextCore: toFilm(nextNodeCoreUnwatched),
        nextExtended: toFilm(extendedDeepCuts),
        reason: `Core complete in ${input.currentNodeName}; continue with ${nextNode.name}.`,
      };
    }
  }

  if (extendedDeepCuts.length > 0) {
    return {
      nextCore: [],
      nextExtended: toFilm(extendedDeepCuts),
      reason: `Core complete in ${input.currentNodeName}; continue with deep cuts in this node.`,
    };
  }

  return {
    nextCore: [],
    nextExtended: [],
    reason: `No further deterministic steps found for ${input.currentNodeName}.`,
  };
}

async function getNextCurriculumStepsWithClient(
  db: PrismaClient,
  input: GetNextCurriculumStepsInput,
): Promise<NextCurriculumSteps | null> {
  const pack = await db.genrePack.findFirst({
    where: {
      slug: input.packSlug,
      season: { slug: input.seasonSlug },
    },
    select: { id: true },
  });
  if (!pack) {
    return null;
  }

  const current = await db.nodeMovie.findFirst({
    where: {
      movie: { tmdbId: input.tmdbId },
      node: { packId: pack.id },
    },
    orderBy: [{ tier: 'asc' }, { coreRank: 'asc' }, { rank: 'asc' }],
    select: {
      node: { select: { slug: true, name: true } },
      movieId: true,
      movie: { select: { tmdbId: true } },
    },
  });
  if (!current) {
    return null;
  }

  const nodes = await db.journeyNode.findMany({
    where: { packId: pack.id },
    orderBy: [{ orderIndex: 'asc' }, { slug: 'asc' }],
    select: {
      slug: true,
      name: true,
      orderIndex: true,
    },
  });
  const rowsRaw = await db.nodeMovie.findMany({
    where: {
      node: { packId: pack.id },
    },
    select: {
      tier: true,
      coreRank: true,
      rank: true,
      finalScore: true,
      journeyScore: true,
      evidence: true,
      node: {
        select: {
          slug: true,
          name: true,
          orderIndex: true,
        },
      },
      movie: {
        select: {
          tmdbId: true,
          title: true,
          year: true,
        },
      },
    },
  });

  const rows: AssignmentRow[] = rowsRaw.map((row) => ({
    tmdbId: row.movie.tmdbId,
    title: row.movie.title,
    year: row.movie.year,
    nodeSlug: row.node.slug,
    nodeName: row.node.name,
    nodeOrder: row.node.orderIndex,
    tier: row.tier,
    coreRank: row.coreRank,
    rank: row.rank,
    finalScore: row.finalScore,
    journeyScore: row.journeyScore,
    evidence: row.evidence,
  }));

  let watchedTmdbIds = new Set<number>();
  if (input.userId) {
    const watchedStatuses: InteractionStatus[] = ['WATCHED', 'ALREADY_SEEN'];
    const watched = await db.userMovieInteraction.findMany({
      where: {
        userId: input.userId,
        packId: pack.id,
        status: { in: watchedStatuses },
      },
      select: { movie: { select: { tmdbId: true } } },
    });
    watchedTmdbIds = new Set(watched.map((row) => row.movie.tmdbId));
  }

  const artifacts = loadSeasonArtifacts(input.seasonSlug);
  return selectNextSteps({
    seasonSlug: input.seasonSlug,
    currentTmdbId: current.movie.tmdbId,
    currentNodeSlug: current.node.slug,
    currentNodeName: current.node.name,
    rows,
    nodes: nodes.map((node) => ({ slug: node.slug, name: node.name, order: node.orderIndex })),
    watchedTmdbIds,
    artifacts,
  });
}

export async function getNextCurriculumSteps(input: GetNextCurriculumStepsInput): Promise<NextCurriculumSteps | null> {
  return getNextCurriculumStepsWithClient(prisma, input);
}

export const __nextCurriculumTestUtils = {
  selectNextSteps,
  buildDeterministicOrder,
  season1Comparator,
  season2Comparator,
};
