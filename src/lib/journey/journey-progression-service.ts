import { PrismaClient } from '@prisma/client';

const DEFAULT_NODE = 'ENGINE_V1_CORE';
const MILESTONE_STEP = 5;

type WatchSignal = {
  userId: string;
  recommendationItemId?: string | null;
  rating?: number | null;
  intensity?: number | null;
  emotions?: string[] | null;
  workedBest?: string[] | null;
  agedWell?: string | null;
  recommend?: boolean | null;
  note?: string | null;
};

type ProgressionScope = {
  packId?: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRating(rating: number | null | undefined): number {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    return 0.5;
  }
  return clamp((rating - 1) / 4, 0, 1);
}

function depthWeightFromNodeOrRank(node: string, rank: number | null): number {
  if (typeof rank === 'number' && rank >= 1) {
    return clamp(1 - ((rank - 1) * 0.08), 0.6, 1.05);
  }

  const match = node.match(/RANK_(\d+)/);
  if (!match) {
    return 0.85;
  }
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed)) {
    return 0.85;
  }
  return clamp(1 - ((parsed - 1) * 0.08), 0.6, 1.05);
}

function engagementWeightFromPoll(signal: WatchSignal): number {
  let score = 0;
  if (typeof signal.intensity === 'number') {
    score += 0.14;
  }
  if (Array.isArray(signal.emotions) && signal.emotions.length > 0) {
    score += 0.16;
  }
  if (Array.isArray(signal.workedBest) && signal.workedBest.length > 0) {
    score += 0.16;
  }
  if (typeof signal.agedWell === 'string' && signal.agedWell.trim().length > 0) {
    score += 0.1;
  }
  if (typeof signal.recommend === 'boolean') {
    score += 0.12;
  }
  if (typeof signal.note === 'string' && signal.note.trim().length > 0) {
    score += 0.12;
  }
  return clamp(0.5 + score, 0.5, 1.2);
}

function masteryDelta(signal: WatchSignal, journeyNode: string, rank: number | null): number {
  const ratingWeight = normalizeRating(signal.rating);
  const depth = depthWeightFromNodeOrRank(journeyNode, rank);
  const engagement = engagementWeightFromPoll(signal);
  return Number((ratingWeight * depth * engagement).toFixed(4));
}

function scopedJourneyNode(journeyNode: string, packId?: string | null): string {
  if (!packId) {
    return journeyNode;
  }
  return `${packId}:${journeyNode}`;
}

function unscopedJourneyNode(journeyNode: string, packId?: string | null): string {
  if (!packId) {
    return journeyNode;
  }
  const prefix = `${packId}:`;
  return journeyNode.startsWith(prefix) ? journeyNode.slice(prefix.length) : journeyNode;
}

export function nextMilestoneForCount(completedCount: number): number {
  return Math.ceil((completedCount + 1) / MILESTONE_STEP) * MILESTONE_STEP;
}

export class JourneyProgressionService {
  constructor(private readonly prisma: PrismaClient) {}

  async trackWatched(signal: WatchSignal, scope?: ProgressionScope): Promise<void> {
    const recommendationItem = signal.recommendationItemId
      ? await this.prisma.recommendationItem.findUnique({
        where: { id: signal.recommendationItemId },
        select: { rank: true, batch: { select: { journeyNode: true, packId: true } } },
      })
      : null;

    const latestBatch = !recommendationItem
      ? await this.prisma.recommendationBatch.findFirst({
        where: {
          userId: signal.userId,
          ...(scope?.packId ? { packId: scope.packId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: { journeyNode: true, packId: true },
      })
      : null;

    const journeyNode = recommendationItem?.batch.journeyNode ?? latestBatch?.journeyNode ?? DEFAULT_NODE;
    const packId = recommendationItem?.batch.packId ?? latestBatch?.packId ?? scope?.packId ?? null;
    const storedJourneyNode = scopedJourneyNode(journeyNode, packId);
    const delta = masteryDelta(signal, journeyNode, recommendationItem?.rank ?? null);
    const now = new Date();

    await this.prisma.journeyProgress.upsert({
      where: {
        userId_journeyNode: {
          userId: signal.userId,
          journeyNode: storedJourneyNode,
        },
      },
      create: {
        userId: signal.userId,
        ...(packId ? { packId } : {}),
        journeyNode: storedJourneyNode,
        completedCount: 1,
        masteryScore: delta,
        lastUpdatedAt: now,
      },
      update: {
        ...(packId ? { packId } : {}),
        completedCount: { increment: 1 },
        masteryScore: { increment: delta },
        lastUpdatedAt: now,
      },
    });
  }

  async getProfileProgress(userId: string, scope?: ProgressionScope): Promise<{
    currentNode: string;
    masteryScore: number;
    completedCount: number;
    nextMilestone: number;
    unlockedThemes: string[];
  }> {
    const current = await this.prisma.journeyProgress.findFirst({
      where: {
        userId,
        ...(scope?.packId ? { packId: scope.packId } : {}),
      },
      orderBy: { lastUpdatedAt: 'desc' },
      select: {
        journeyNode: true,
        masteryScore: true,
        completedCount: true,
      },
    });

    if (!current) {
      return {
        currentNode: DEFAULT_NODE,
        masteryScore: 0,
        completedCount: 0,
        nextMilestone: MILESTONE_STEP,
        unlockedThemes: [],
      };
    }

    const all = await this.prisma.journeyProgress.findMany({
      where: {
        userId,
        masteryScore: { gte: 3 },
        ...(scope?.packId ? { packId: scope.packId } : {}),
      },
      orderBy: { masteryScore: 'desc' },
      select: { journeyNode: true },
      take: 6,
    });

    return {
      currentNode: unscopedJourneyNode(current.journeyNode, scope?.packId),
      masteryScore: Number(current.masteryScore.toFixed(2)),
      completedCount: current.completedCount,
      nextMilestone: nextMilestoneForCount(current.completedCount),
      unlockedThemes: all.map((item) => unscopedJourneyNode(item.journeyNode, scope?.packId)),
    };
  }
}
