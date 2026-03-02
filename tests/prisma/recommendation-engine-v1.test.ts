import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { InteractionStatus, PrismaClient } from '@prisma/client';
import { generateRecommendationBatchV1 } from '@/lib/recommendation/recommendation-engine-v1';

const testDbPath = 'prisma/test-recommendation-engine.db';
const testDbUrl = `file:${testDbPath}`;

const prisma = new PrismaClient({
  datasources: {
    db: { url: testDbUrl },
  },
});

beforeAll(() => {
  if (existsSync(testDbPath)) {
    rmSync(testDbPath);
  }

  execSync(`DATABASE_URL=${testDbUrl} npx prisma db push --skip-generate`, {
    stdio: 'inherit',
  });
});

beforeEach(async () => {
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();
});

describe('RecommendationEngine v1', () => {
  it('excludes movies already WATCHED/ALREADY_SEEN by the user', async () => {
    const user = await prisma.user.create({ data: { displayName: 'A' } });
    const movies = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        prisma.movie.create({ data: { tmdbId: n, title: `Movie ${n}`, year: 2000 + n, genres: ['horror'] } }),
      ),
    );

    await prisma.userMovieInteraction.create({
      data: { userId: user.id, movieId: movies[0]!.id, status: InteractionStatus.WATCHED, rating: 4 },
    });
    await prisma.userMovieInteraction.create({
      data: { userId: user.id, movieId: movies[1]!.id, status: InteractionStatus.ALREADY_SEEN, rating: 5 },
    });

    const result = await generateRecommendationBatchV1(user.id, prisma);

    expect(result.cards).toHaveLength(4);
    expect(result.cards.find((card) => card.movie.tmdbId === 1)).toBeUndefined();
    expect(result.cards.find((card) => card.movie.tmdbId === 2)).toBeUndefined();
  });

  it('returns 5 recommendations when inventory allows', async () => {
    const user = await prisma.user.create({ data: { displayName: 'B' } });

    await Promise.all(
      [10, 11, 12, 13, 14, 15].map((n) =>
        prisma.movie.create({ data: { tmdbId: n, title: `Movie ${n}`, year: 1990 + n, genres: ['thriller'] } }),
      ),
    );

    const result = await generateRecommendationBatchV1(user.id, prisma);

    expect(result.cards).toHaveLength(5);
    const batch = await prisma.recommendationBatch.findUnique({ where: { id: result.batchId }, include: { items: true } });
    expect(batch?.items).toHaveLength(5);
  });

  it('keeps user batches isolated without cross-user contamination', async () => {
    const userA = await prisma.user.create({ data: { displayName: 'User A' } });
    const userB = await prisma.user.create({ data: { displayName: 'User B' } });

    const m1 = await prisma.movie.create({ data: { tmdbId: 101, title: 'A1', year: 1981, genres: ['slasher'] } });
    const m2 = await prisma.movie.create({ data: { tmdbId: 102, title: 'B1', year: 1982, genres: ['ghost'] } });
    await prisma.movie.create({ data: { tmdbId: 103, title: 'C1', year: 1983, genres: ['body-horror'] } });
    await prisma.movie.create({ data: { tmdbId: 104, title: 'D1', year: 1984, genres: ['slasher'] } });
    await prisma.movie.create({ data: { tmdbId: 105, title: 'E1', year: 1985, genres: ['ghost'] } });
    await prisma.movie.create({ data: { tmdbId: 106, title: 'F1', year: 1986, genres: ['body-horror'] } });

    await prisma.userMovieInteraction.create({ data: { userId: userA.id, movieId: m1.id, status: InteractionStatus.WATCHED, rating: 5 } });
    await prisma.userMovieInteraction.create({ data: { userId: userB.id, movieId: m2.id, status: InteractionStatus.WATCHED, rating: 4 } });

    const resultA = await generateRecommendationBatchV1(userA.id, prisma);
    const resultB = await generateRecommendationBatchV1(userB.id, prisma);

    expect(resultA.cards.find((card) => card.movie.tmdbId === 101)).toBeUndefined();
    expect(resultB.cards.find((card) => card.movie.tmdbId === 102)).toBeUndefined();

    const batchA = await prisma.recommendationBatch.findUnique({ where: { id: resultA.batchId } });
    const batchB = await prisma.recommendationBatch.findUnique({ where: { id: resultB.batchId } });
    expect(batchA?.userId).toBe(userA.id);
    expect(batchB?.userId).toBe(userB.id);
  });

  it('applies diversity by varying decades and genres when possible', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Diversity User' } });

    await prisma.movie.create({ data: { tmdbId: 201, title: '70s Giallo', year: 1977, genres: ['giallo'] } });
    await prisma.movie.create({ data: { tmdbId: 202, title: '80s Slasher', year: 1984, genres: ['slasher'] } });
    await prisma.movie.create({ data: { tmdbId: 203, title: '90s Found Footage', year: 1999, genres: ['found-footage'] } });
    await prisma.movie.create({ data: { tmdbId: 204, title: '00s Supernatural', year: 2004, genres: ['supernatural'] } });
    await prisma.movie.create({ data: { tmdbId: 205, title: '10s Arthouse', year: 2017, genres: ['arthouse'] } });
    await prisma.movie.create({ data: { tmdbId: 206, title: '10s Slasher', year: 2019, genres: ['slasher'] } });

    const result = await generateRecommendationBatchV1(user.id, prisma);

    const decades = new Set(result.cards.map((card) => Math.floor((card.movie.year ?? 0) / 10) * 10));
    const genres = new Set(result.cards.flatMap((card) => card.movie.genres ?? []));

    expect(result.cards).toHaveLength(5);
    expect(decades.size).toBeGreaterThanOrEqual(3);
    expect(genres.size).toBeGreaterThanOrEqual(3);
  });
});
