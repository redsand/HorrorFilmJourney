import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { evaluateCurriculumEligibility } from '@/lib/curriculum/eligibility';

const testDbUrl = buildTestDatabaseUrl('season_2_curriculum_integrity_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

const strictGateEnabled = process.env.SEASON2_ENFORCE_THRESHOLDS === 'true';
const maybeIt = strictGateEnabled ? it : it.skip;

describe('Season 2 curriculum integrity gates', () => {
  maybeIt('enforces duplicate quality and baseline eligibility across nodes', async () => {
    // This test intentionally assumes the season-2 seed script has already been run
    // against the same database.
    const pack = await prisma.genrePack.findFirst({
      where: { slug: 'cult-classics' },
      select: {
        id: true,
        isEnabled: true,
        nodes: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            slug: true,
            movies: {
              select: {
                movie: {
                  select: {
                    id: true,
                    tmdbId: true,
                    posterUrl: true,
                    director: true,
                    castTop: true,
                    ratings: { select: { source: true } },
                    streamingCache: { select: { id: true }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(pack).toBeDefined();
    expect(pack?.isEnabled).toBe(false);
    expect(pack?.nodes).toHaveLength(8);

    const tmdbCounts = new Map<number, number>();
    let totalAssignments = 0;

    for (const node of pack?.nodes ?? []) {
      const eligible = node.movies.filter((assignment) =>
        evaluateCurriculumEligibility({
          posterUrl: assignment.movie.posterUrl,
          director: assignment.movie.director,
          castTop: assignment.movie.castTop,
          ratings: assignment.movie.ratings,
          hasStreamingData: assignment.movie.streamingCache.length > 0,
        }).isEligible,
      );
      expect(eligible.length).toBeGreaterThan(0);
      eligible.forEach((assignment) => {
        const tmdbId = assignment.movie.tmdbId;
        tmdbCounts.set(tmdbId, (tmdbCounts.get(tmdbId) ?? 0) + 1);
        totalAssignments += 1;
      });
    }

    const duplicates = [...tmdbCounts.entries()].filter(([, count]) => count > 1).length;
    const duplicateRate = totalAssignments > 0 ? (duplicates / totalAssignments) * 100 : 0;
    expect(duplicateRate).toBeLessThanOrEqual(2);
  });
});
