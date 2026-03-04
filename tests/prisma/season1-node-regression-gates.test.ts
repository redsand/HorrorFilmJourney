import { execSync } from 'node:child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';
import { loadSeason1NodeGovernanceConfig } from '@/lib/nodes/governance';

const testDbUrl = buildTestDatabaseUrl('season1_node_regression_gates_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

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
      SEASON1_TAXONOMY_VERSION: 'season-1-horror-test-gates-v1',
      SEASON1_ASSIGNMENT_RUN_ID: 'season1-regression-gates-test-run',
      SEASON1_TARGET_PER_NODE: '6',
      SEASON1_MIN_ELIGIBLE_PER_NODE: '1',
      SEASON1_MAX_NODES_PER_MOVIE: '3',
      SEASON1_PUBLISH_SNAPSHOT: 'true',
    },
  });
});

describe('season1 regression gates', () => {
  it('keeps taxonomy, node sizes, overlap anomalies, and no-node coverage in bounds', async () => {
    const governance = await loadSeason1NodeGovernanceConfig();
    const pack = await prisma.genrePack.findUnique({
      where: { slug: 'horror' },
      select: {
        id: true,
        season: { select: { slug: true } },
        nodes: {
          select: {
            slug: true,
            movies: { select: { movieId: true } },
          },
        },
      },
    });
    expect(pack).toBeTruthy();
    expect(pack!.season.slug).toBe('season-1');
    expect(pack!.nodes).toHaveLength(16);

    const byMovie = new Map<string, string[]>();
    for (const node of pack!.nodes) {
      expect(node.movies.length).toBeLessThanOrEqual(6);
      for (const assignment of node.movies) {
        const list = byMovie.get(assignment.movieId) ?? [];
        list.push(node.slug);
        byMovie.set(assignment.movieId, list);
      }
    }

    const disallowedHits = governance.overlapConstraints.disallowedPairs.reduce((acc, [a, b]) => {
      let count = 0;
      for (const slugs of byMovie.values()) {
        const set = new Set(slugs);
        if (set.has(a) && set.has(b)) {
          count += 1;
        }
      }
      return acc + count;
    }, 0);
    expect(disallowedHits).toBe(0);

    const movies = await prisma.movie.findMany({ select: { id: true, genres: true } });
    const horrorMovies = movies.filter((movie) => parseGenres(movie.genres).includes('horror'));
    const noNodeCount = horrorMovies.filter((movie) => !byMovie.has(movie.id)).length;
    const noNodePct = horrorMovies.length > 0 ? noNodeCount / horrorMovies.length : 0;
    expect(noNodePct).toBeLessThanOrEqual(0.75);
  });
});
