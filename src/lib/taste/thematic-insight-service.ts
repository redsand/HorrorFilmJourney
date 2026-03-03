import { InteractionStatus, PrismaClient, type Prisma } from '@prisma/client';
import { buildPackScopedInteractionWhere } from '@/lib/packs/interaction-scope';

type InsightType = 'decade' | 'subgenre' | 'intensity' | 'comparison';

export type ThematicInsight = {
  id: string;
  type: InsightType;
  message: string;
  delta: number;
  sampleSize: number;
};

type RatedInteraction = {
  rating: number;
  intensity: number | null;
  movie: {
    year: number | null;
    genres: Prisma.JsonValue | null;
  };
};

function toGenres(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function significanceScore(group: number[], baselineMean: number): number {
  if (group.length < 3) {
    return 0;
  }
  const delta = average(group) - baselineMean;
  const sd = stdDev(group);
  const se = sd / Math.sqrt(group.length);
  if (se <= 0) {
    return Math.abs(delta) * Math.sqrt(group.length);
  }
  return Math.abs(delta / se);
}

function isSignificant(group: number[], baselineMean: number): boolean {
  const delta = Math.abs(average(group) - baselineMean);
  return group.length >= 3 && delta >= 0.6 && significanceScore(group, baselineMean) >= 1.2;
}

function decadeFromYear(year: number | null): string | null {
  if (!year) {
    return null;
  }
  return `${Math.floor(year / 10) * 10}s`;
}

function intensityBucket(value: number | null): 'low' | 'medium' | 'high' | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value <= 2) {
    return 'low';
  }
  if (value === 3) {
    return 'medium';
  }
  return 'high';
}

function addGroup(map: Map<string, number[]>, key: string, rating: number): void {
  const current = map.get(key) ?? [];
  current.push(rating);
  map.set(key, current);
}

function formatDelta(delta: number): string {
  const abs = Math.abs(delta).toFixed(1);
  return delta >= 0 ? `${abs} stars higher` : `${abs} stars lower`;
}

function subgenreLabel(tag: string): string {
  return tag
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildComparisonInsight(decadeGroups: Map<string, number[]>): ThematicInsight | null {
  const ranked = [...decadeGroups.entries()]
    .filter(([, ratings]) => ratings.length >= 3)
    .map(([decade, ratings]) => ({ decade, ratings, avg: average(ratings) }))
    .sort((a, b) => b.avg - a.avg);

  if (ranked.length < 2) {
    return null;
  }
  const top = ranked[0]!;
  const bottom = ranked[ranked.length - 1]!;
  const delta = top.avg - bottom.avg;
  if (Math.abs(delta) < 0.7) {
    return null;
  }
  return {
    id: `comparison:${top.decade}:${bottom.decade}`,
    type: 'comparison',
    message: `You prefer ${top.decade} horror over ${bottom.decade} horror.`,
    delta: Number(delta.toFixed(2)),
    sampleSize: Math.min(top.ratings.length, bottom.ratings.length),
  };
}

export class ThematicInsightService {
  constructor(private readonly prisma: PrismaClient) {}

  async getInsights(
    userId: string,
    options?: { packId?: string | null },
  ): Promise<{ insights: ThematicInsight[]; totalRated: number }> {
    const rows = await this.prisma.userMovieInteraction.findMany({
      where: {
        userId,
        status: { in: [InteractionStatus.WATCHED, InteractionStatus.ALREADY_SEEN] },
        rating: { not: null },
        ...buildPackScopedInteractionWhere(options?.packId),
      },
      select: {
        rating: true,
        intensity: true,
        movie: {
          select: {
            year: true,
            genres: true,
          },
        },
      },
    });

    const interactions: RatedInteraction[] = rows
      .filter((row): row is typeof row & { rating: number } => typeof row.rating === 'number')
      .map((row) => ({
        rating: row.rating,
        intensity: row.intensity,
        movie: row.movie,
      }));

    if (interactions.length < 6) {
      return { insights: [], totalRated: interactions.length };
    }

    const baseline = average(interactions.map((item) => item.rating));
    const decadeGroups = new Map<string, number[]>();
    const subgenreGroups = new Map<string, number[]>();
    const intensityGroups = new Map<string, number[]>();

    interactions.forEach((item) => {
      const decade = decadeFromYear(item.movie.year);
      if (decade) {
        addGroup(decadeGroups, decade, item.rating);
      }

      const genres = toGenres(item.movie.genres).filter((genre) => genre !== 'horror');
      genres.forEach((genre) => addGroup(subgenreGroups, genre, item.rating));

      const bucket = intensityBucket(item.intensity);
      if (bucket) {
        addGroup(intensityGroups, bucket, item.rating);
      }
    });

    const insights: ThematicInsight[] = [];
    for (const [decade, ratings] of decadeGroups.entries()) {
      if (!isSignificant(ratings, baseline)) {
        continue;
      }
      const delta = average(ratings) - baseline;
      insights.push({
        id: `decade:${decade}`,
        type: 'decade',
        message: `You rate ${decade} horror ${formatDelta(delta)} than your baseline.`,
        delta: Number(delta.toFixed(2)),
        sampleSize: ratings.length,
      });
    }

    for (const [genre, ratings] of subgenreGroups.entries()) {
      if (!isSignificant(ratings, baseline)) {
        continue;
      }
      const delta = average(ratings) - baseline;
      insights.push({
        id: `subgenre:${genre}`,
        type: 'subgenre',
        message: `You rate ${subgenreLabel(genre)} films ${formatDelta(delta)} than your baseline.`,
        delta: Number(delta.toFixed(2)),
        sampleSize: ratings.length,
      });
    }

    for (const [bucket, ratings] of intensityGroups.entries()) {
      if (!isSignificant(ratings, baseline)) {
        continue;
      }
      const delta = average(ratings) - baseline;
      insights.push({
        id: `intensity:${bucket}`,
        type: 'intensity',
        message: `You rate ${bucket}-intensity films ${formatDelta(delta)} than your baseline.`,
        delta: Number(delta.toFixed(2)),
        sampleSize: ratings.length,
      });
    }

    const comparison = buildComparisonInsight(decadeGroups);
    if (comparison) {
      insights.push(comparison);
    }

    const ranked = insights
      .sort((a, b) => (Math.abs(b.delta) - Math.abs(a.delta)) || (b.sampleSize - a.sampleSize))
      .slice(0, 6);

    return { insights: ranked, totalRated: interactions.length };
  }
}
