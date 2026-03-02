import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';

const schemaName = 'seed_catalog_e2e_test';
const databaseUrl = buildTestDatabaseUrl(schemaName);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

beforeAll(() => {
  prismaDbPush(databaseUrl);
});

beforeEach(async () => {
  await prisma.movieStreamingCache.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movie.deleteMany();
});

describe('starter catalog seed', () => {
  it('creates at least 30 movies with required narrative-loop data and is idempotent', async () => {
    const first = await seedStarterHorrorCatalog(prisma);
    const second = await seedStarterHorrorCatalog(prisma);

    expect(first.movieCount).toBeGreaterThanOrEqual(30);
    expect(second.movieCount).toBe(first.movieCount);

    const movies = await prisma.movie.findMany({
      include: { ratings: true, evidencePackets: true },
    });

    expect(movies.length).toBeGreaterThanOrEqual(30);
    expect(movies.every((movie) => movie.posterUrl.trim().length > 0)).toBe(true);
    expect(movies.every((movie) => typeof movie.director === 'string' && movie.director.trim().length > 0)).toBe(true);
    expect(movies.every((movie) => Array.isArray(movie.castTop))).toBe(true);
    expect(
      movies.every((movie) => {
        const hasImdb = movie.ratings.some((rating) => rating.source === 'IMDB');
        const additionalCount = movie.ratings.filter((rating) => rating.source !== 'IMDB').length;
        return hasImdb && additionalCount >= 1;
      }),
    ).toBe(true);

    const evidenceMovieCount = movies.filter((movie) => movie.evidencePackets.length > 0).length;
    expect(evidenceMovieCount).toBeGreaterThanOrEqual(10);
  });
});
