import { execSync } from 'node:child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';
import { SqlCandidateGeneratorV1 } from '@/lib/recommendation/recommendation-engine';

const testDbUrl = buildTestDatabaseUrl('season1_published_snapshot_read_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

async function resetDb(): Promise<void> {
  await prisma.seasonNodeReleaseItem.deleteMany();
  await prisma.seasonNodeRelease.deleteMany();
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
}

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  process.env.SEASONS_PACKS_ENABLED = 'true';
  await resetDb();
  await seedStarterHorrorCatalog(prisma);

  execSync('tsx scripts/seed-season1-horror-subgenres.ts', {
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: testDbUrl,
      SEASON1_TAXONOMY_VERSION: 'season-1-horror-test-v3.5',
      SEASON1_ASSIGNMENT_RUN_ID: 'season1-published-snapshot-test-run',
      SEASON1_TARGET_PER_NODE: '6',
      SEASON1_MIN_ELIGIBLE_PER_NODE: '1',
      SEASON1_MAX_NODES_PER_MOVIE: '3',
      SEASON1_PUBLISH_SNAPSHOT: 'true',
    },
  });
});

describe('season1 published snapshot recommendation read path', () => {
  it('uses published snapshot assignments when NodeMovie rows are missing', async () => {
    const pack = await prisma.genrePack.findUnique({
      where: { slug: 'horror' },
      select: { id: true },
    });
    expect(pack).toBeTruthy();

    const published = await prisma.seasonNodeRelease.findFirst({
      where: { packId: pack!.id, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        items: {
          where: { nodeSlug: 'supernatural-horror' },
          select: { movieId: true },
          take: 5,
        },
      },
    });
    expect(published).toBeTruthy();
    expect(published!.items.length).toBeGreaterThan(0);

    const node = await prisma.journeyNode.findFirst({
      where: { packId: pack!.id, slug: 'supernatural-horror' },
      select: { id: true },
    });
    expect(node).toBeTruthy();

    await prisma.nodeMovie.deleteMany({ where: { nodeId: node!.id } });

    const user = await prisma.user.create({
      data: {
        displayName: 'Snapshot Read User',
        credentials: {
          create: {
            email: 'snapshot-read@test.local',
            passwordHash: 'hash',
            isAdmin: false,
          },
        },
      },
      select: { id: true },
    });

    const generator = new SqlCandidateGeneratorV1(prisma);
    const candidateIds = await generator.generateCandidates(user.id, {
      targetCount: 5,
      excludeRecentSkippedDays: 30,
      packPrimaryGenre: 'horror',
      packId: pack!.id,
      journeyNodeSlug: 'supernatural-horror',
    });

    const snapshotMovieIds = new Set(published!.items.map((item) => item.movieId));
    const overlap = candidateIds.filter((id) => snapshotMovieIds.has(id));

    expect(overlap.length).toBeGreaterThan(0);
  });
});
