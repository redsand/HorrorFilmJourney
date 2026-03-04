import { execSync } from 'node:child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';
import { loadSeason1NodeGovernanceConfig, toPairKey } from '@/lib/nodes/governance';

const testDbUrl = buildTestDatabaseUrl('season1_node_governance_controls_test');
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

  execSync('node --experimental-strip-types scripts/seed-season1-horror-subgenres.ts', {
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: testDbUrl,
      SEASON1_TAXONOMY_VERSION: 'season-1-horror-test-v3.5',
      SEASON1_ASSIGNMENT_RUN_ID: 'season1-governance-test-run',
      SEASON1_TARGET_PER_NODE: '6',
      SEASON1_MIN_ELIGIBLE_PER_NODE: '1',
      SEASON1_MAX_NODES_PER_MOVIE: '3',
      SEASON1_PUBLISH_SNAPSHOT: 'true',
    },
  });
});

describe('season1 governance controls', () => {
  it('enforces taxonomy count, bounds, overlap constraints, and published snapshot', async () => {
    const season = await prisma.season.findUnique({
      where: { slug: 'season-1' },
      select: {
        id: true,
        packs: {
          where: { slug: 'horror' },
          select: {
            id: true,
            nodes: {
              orderBy: { orderIndex: 'asc' },
              select: {
                slug: true,
                taxonomyVersion: true,
                movies: {
                  select: {
                    movieId: true,
                    source: true,
                    taxonomyVersion: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(season).toBeTruthy();
    const pack = season!.packs[0]!;
    expect(pack.nodes).toHaveLength(16);

    const governance = await loadSeason1NodeGovernanceConfig();
    const target = 6;
    const min = 1;
    let nodesMeetingMin = 0;

    for (const node of pack.nodes) {
      expect(node.taxonomyVersion).toBe('season-1-horror-test-v3.5');
      expect(node.movies.length).toBeLessThanOrEqual(target);
      if (node.movies.length >= min) {
        nodesMeetingMin += 1;
      }
      for (const assignment of node.movies) {
        expect(assignment.taxonomyVersion).toBe('season-1-horror-test-v3.5');
      }
    }
    expect(nodesMeetingMin).toBeGreaterThanOrEqual(8);

    const byMovie = new Map<string, Array<{ slug: string; source: string }>>();
    for (const node of pack.nodes) {
      for (const assignment of node.movies) {
        const list = byMovie.get(assignment.movieId) ?? [];
        list.push({ slug: node.slug, source: assignment.source });
        byMovie.set(assignment.movieId, list);
      }
    }

    const overlapHits: string[] = [];
    for (const [movieId, assignments] of byMovie.entries()) {
      const set = new Set(assignments.map((item) => item.slug));
      for (const [a, b] of governance.overlapConstraints.disallowedPairs) {
        if (set.has(a) && set.has(b)) {
          overlapHits.push(`${movieId}:${toPairKey(a, b)}`);
        }
      }
      if (set.size > 3) {
        expect(assignments.every((item) => item.source === 'curated')).toBe(true);
      } else {
        expect(set.size).toBeLessThanOrEqual(3);
      }
    }
    expect(overlapHits).toHaveLength(0);

    const horrorMoviesRaw = await prisma.movie.findMany({
      select: { id: true, genres: true },
    });
    const horrorMovies = horrorMoviesRaw.filter((movie) =>
      Array.isArray(movie.genres) && movie.genres.some((entry) => typeof entry === 'string' && entry.toLowerCase() === 'horror'));

    const noNodeCount = horrorMovies.filter((movie) => !byMovie.has(movie.id)).length;
    const noNodePct = horrorMovies.length === 0 ? 0 : noNodeCount / horrorMovies.length;
    expect(noNodePct).toBeGreaterThanOrEqual(0);
    expect(noNodePct).toBeLessThanOrEqual(0.75);

    const published = await prisma.seasonNodeRelease.findFirst({
      where: {
        seasonId: season!.id,
        packId: pack.id,
        isPublished: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        taxonomyVersion: true,
        runId: true,
        items: {
          select: { id: true },
        },
      },
    });

    expect(published).toBeTruthy();
    expect(published!.taxonomyVersion).toBe('season-1-horror-test-v3.5');
    expect(published!.runId).toBe('season1-governance-test-run');
    expect(published!.items.length).toBeGreaterThan(0);
  });
});
