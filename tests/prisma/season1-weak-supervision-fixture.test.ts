import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';
import {
  DEFAULT_NODE_THRESHOLDS,
  buildSeason1LabelingFunctions,
  inferNodeProbabilities,
  type WeakSupervisionMovie,
} from '@/lib/nodes/weak-supervision';

type GoldFixture = {
  samples: Array<{
    title: string;
    year: number;
    expectedNodes: string[];
  }>;
};

const testDbUrl = buildTestDatabaseUrl('season1_weak_supervision_fixture_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  await seedStarterHorrorCatalog(prisma);
});

describe('season1 weak supervision fixture agreement', () => {
  it('matches expected nodes within tolerance on available fixture titles', async () => {
    const fixture = JSON.parse(
      readFileSync(resolve('tests/fixtures/season1-node-gold.json'), 'utf8'),
    ) as GoldFixture;

    const moviesRaw = await prisma.movie.findMany({
      select: { id: true, tmdbId: true, title: true, year: true, genres: true },
    });

    const movies: WeakSupervisionMovie[] = moviesRaw.map((movie) => ({
      id: movie.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      genres: Array.isArray(movie.genres)
        ? movie.genres.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.toLowerCase())
        : [],
    }));

    const movieMap = new Map(
      movies.map((movie) => [`${normalizeTitle(movie.title)}::${movie.year ?? -1}`, movie] as const),
    );

    const nodeSlugs = Object.keys(DEFAULT_NODE_THRESHOLDS);
    const lfs = buildSeason1LabelingFunctions(nodeSlugs);

    let found = 0;
    let matched = 0;

    for (const sample of fixture.samples) {
      const movie = movieMap.get(`${normalizeTitle(sample.title)}::${sample.year}`);
      if (!movie) {
        continue;
      }
      found += 1;

      const inferred = inferNodeProbabilities(movie, nodeSlugs, lfs);
      const predicted = inferred
        .filter((entry) => entry.probability >= (DEFAULT_NODE_THRESHOLDS[entry.nodeSlug] ?? 0.65))
        .map((entry) => entry.nodeSlug);

      const overlap = sample.expectedNodes.filter((node) => predicted.includes(node));
      if (overlap.length > 0) {
        matched += 1;
      }
    }

    const agreement = found > 0 ? matched / found : 0;

    expect(found).toBeGreaterThanOrEqual(16);
    expect(agreement).toBeGreaterThanOrEqual(0.55);
  });
});
