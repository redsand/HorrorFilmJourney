import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';

const testDbUrl = buildTestDatabaseUrl('seed_catalog_verification_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
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

describe('seed catalog verification', () => {
  it('seeds >=30 movies with posterUrl and IMDb + additional ratings', async () => {
    await seedStarterHorrorCatalog(prisma);

    const movies = await prisma.movie.findMany({
      include: { ratings: true },
    });

    expect(movies.length).toBeGreaterThanOrEqual(30);
    expect(movies.every((movie) => movie.posterUrl.trim().length > 0)).toBe(true);
    expect(
      movies.every((movie) => {
        const hasImdb = movie.ratings.some((rating) => rating.source === 'IMDB');
        const additional = movie.ratings.filter((rating) => rating.source !== 'IMDB').length;
        return hasImdb && additional >= 1;
      }),
    ).toBe(true);

    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
      include: { packs: true },
    });
    expect(activeSeason?.slug).toBe('season-1');
    expect(activeSeason?.packs.some((pack) => pack.slug === 'horror' && pack.isEnabled)).toBe(true);
  });
});
