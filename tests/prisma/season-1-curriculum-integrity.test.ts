import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';
import { isRecommendationEligibleMovie } from '@/lib/recommendation/recommendation-engine-v1';

const testDbUrl = buildTestDatabaseUrl('season_1_curriculum_integrity_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  process.env.SEASONS_PACKS_ENABLED = 'true';
  await prisma.nodeMovie.deleteMany();
  await prisma.journeyNode.deleteMany();
  await prisma.movieStreamingCache.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.userCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.journeyProgress.deleteMany();
  await prisma.genrePack.deleteMany();
  await prisma.season.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movie.deleteMany();
});

describe('Season 1 curriculum seed integrity', () => {
  it('creates 8-12 journey nodes with curated eligible titles and minimum coverage', async () => {
    await seedStarterHorrorCatalog(prisma);

    const season = await prisma.season.findUnique({
      where: { slug: 'season-1' },
      select: {
        packs: {
          where: { slug: 'horror' },
          include: {
            nodes: {
              orderBy: { orderIndex: 'asc' },
              include: {
                movies: {
                  orderBy: { rank: 'asc' },
                  include: {
                    movie: {
                      include: {
                        ratings: { select: { source: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const nodes = season?.packs[0]?.nodes ?? [];
    expect(nodes.length).toBeGreaterThanOrEqual(8);
    expect(nodes.length).toBeLessThanOrEqual(12);

    for (const node of nodes) {
      const eligibleCount = node.movies.filter((assignment) =>
        isRecommendationEligibleMovie({
          posterUrl: assignment.movie.posterUrl,
          posterLastValidatedAt: assignment.movie.posterLastValidatedAt,
          ratings: assignment.movie.ratings,
        })).length;

      expect(node.movies.length).toBeGreaterThanOrEqual(8);
      expect(eligibleCount).toBeGreaterThanOrEqual(8);
    }
  });
});
