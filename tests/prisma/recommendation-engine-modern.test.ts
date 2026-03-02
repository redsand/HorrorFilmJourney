import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('recommendation_engine_modern_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

async function addRatings(movieId: string): Promise<void> {
  await prisma.movieRating.createMany({
    data: [
      { movieId, source: 'IMDB', value: 7.8, scale: '10', rawValue: '7.8/10' },
      { movieId, source: 'ROTTEN_TOMATOES', value: 92, scale: '100', rawValue: '92%' },
      { movieId, source: 'METACRITIC', value: 81, scale: '100', rawValue: '81/100' },
    ],
  });
}

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  delete process.env.REC_ENGINE_MODE;
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movieEmbedding.deleteMany();
  await prisma.userEmbeddingSnapshot.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();
});

describe('RecommendationEngine modern mode', () => {
  it('matches v1 outputs while enforcing ratings and poster in cards', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Mode User' } });
    const movies = await Promise.all(
      [601, 602, 603, 604, 605, 606].map((tmdbId, i) =>
        prisma.movie.create({ data: { tmdbId, title: `Movie ${tmdbId}`, year: 2000 + i, posterUrl: `https://img/${tmdbId}.jpg`, genres: ['horror'] } }),
      ),
    );
    await Promise.all(movies.map((m) => addRatings(m.id)));

    process.env.REC_ENGINE_MODE = 'v1';
    const v1 = await generateRecommendationBatch(user.id, prisma);

    process.env.REC_ENGINE_MODE = 'modern';
    const modern = await generateRecommendationBatch(user.id, prisma);

    expect(modern.cards.map((c) => c.movie.tmdbId)).toEqual(v1.cards.map((c) => c.movie.tmdbId));
    expect(modern.cards.every((card) => card.movie.posterUrl.length > 0)).toBe(true);
    expect(modern.cards.every((card) => typeof card.ratings.imdb.value === 'number')).toBe(true);
    expect(modern.cards.every((card) => card.ratings.additional.length >= 1)).toBe(true);

    const diagnostics = await prisma.recommendationDiagnostics.findUnique({ where: { batchId: modern.batchId } });
    expect(diagnostics).not.toBeNull();
    expect(diagnostics?.batchId).toBe(modern.batchId);
    expect(diagnostics?.candidateCount).toBeGreaterThanOrEqual(modern.cards.length);
    expect(diagnostics?.excludedSeenCount).toBe(0);
    expect(diagnostics?.excludedSkippedRecentCount).toBe(0);
    expect(typeof diagnostics?.explorationUsed).toBe('boolean');
    expect(diagnostics?.diversityStats).toMatchObject({
      candidatePool: 6,
      selectedCount: modern.cards.length,
    });
  });
});
