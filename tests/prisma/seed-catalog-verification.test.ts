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

    const season2 = await prisma.season.findUnique({
      where: { slug: 'season-2' },
      include: { packs: { include: { nodes: true } } },
    });
    expect(season2?.isActive).toBe(false);
    expect(season2?.description).toBe('Midnight cinema, underground legends, and the films that refused to die.');
    const cultPack = season2?.packs.find((pack) => pack.slug === 'cult-classics');
    expect(cultPack).toBeDefined();
    expect(cultPack?.isEnabled).toBe(false);
    expect(cultPack?.primaryGenre).toBe('cult');
    expect(cultPack?.description).toBe('Midnight movies, grindhouse legends, and the underground canon.');
    expect(cultPack?.nodes.length).toBe(8);

    const cultNodeMovies = await prisma.nodeMovie.count({
      where: {
        node: {
          pack: {
            slug: 'cult-classics',
          },
        },
      },
    });
    expect(cultNodeMovies).toBe(0);
  });
});
