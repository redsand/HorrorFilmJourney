import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InteractionStatus, PrismaClient } from '@prisma/client';
import { generateRecommendationBatchV1 } from '@/lib/recommendation/recommendation-engine-v1';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('recommendation_engine_v1_test');

const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

async function addRatings(movieId: string, includeImdb = true, extraSources = 2): Promise<void> {
  const data = [] as Array<{ movieId: string; source: string; value: number; scale: string; rawValue: string }>;
  if (includeImdb) data.push({ movieId, source: 'IMDB', value: 7.8, scale: '10', rawValue: '7.8/10' });
  if (extraSources >= 1) data.push({ movieId, source: 'ROTTEN_TOMATOES', value: 92, scale: '100', rawValue: '92%' });
  if (extraSources >= 2) data.push({ movieId, source: 'METACRITIC', value: 81, scale: '100', rawValue: '81/100' });
  if (extraSources >= 3) data.push({ movieId, source: 'TMDB', value: 7.5, scale: '10', rawValue: '7.5/10' });
  await prisma.movieRating.createMany({ data });
}

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movieEmbedding.deleteMany();
  await prisma.userEmbeddingSnapshot.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();
});

describe('RecommendationEngine v1', () => {
  it('excludes movies already WATCHED/ALREADY_SEEN by the user', async () => {
    const user = await prisma.user.create({ data: { displayName: 'A' } });
    const movies = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        prisma.movie.create({ data: { tmdbId: n, title: `Movie ${n}`, year: 2000 + n, posterUrl: `https://img/${n}.jpg`, genres: ['horror'] } }),
      ),
    );
    await Promise.all(movies.map((m) => addRatings(m.id)));

    await prisma.userMovieInteraction.create({ data: { userId: user.id, movieId: movies[0]!.id, status: InteractionStatus.WATCHED, rating: 4 } });
    await prisma.userMovieInteraction.create({ data: { userId: user.id, movieId: movies[1]!.id, status: InteractionStatus.ALREADY_SEEN, rating: 5 } });

    const result = await generateRecommendationBatchV1(user.id, prisma);
    expect(result.cards).toHaveLength(4);
    expect(result.cards.find((card) => card.movie.tmdbId === 1)).toBeUndefined();
    expect(result.cards.find((card) => card.movie.tmdbId === 2)).toBeUndefined();
  });

  it('enforces poster + imdb + minimum 3 ratings eligibility', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Eligibility' } });

    const missingPoster = await prisma.movie.create({ data: { tmdbId: 301, title: 'Missing Poster', posterUrl: '', genres: ['horror'] } });
    const missingImdb = await prisma.movie.create({ data: { tmdbId: 302, title: 'Missing IMDB', posterUrl: 'https://img/302.jpg', genres: ['horror'] } });
    const oneSource = await prisma.movie.create({ data: { tmdbId: 303, title: 'One Source', posterUrl: 'https://img/303.jpg', genres: ['horror'] } });
    const twoSources = await prisma.movie.create({ data: { tmdbId: 305, title: 'Two Sources', posterUrl: 'https://img/305.jpg', genres: ['horror'] } });
    const eligible = await prisma.movie.create({ data: { tmdbId: 304, title: 'Eligible', posterUrl: 'https://img/304.jpg', genres: ['horror'] } });

    await addRatings(missingPoster.id);
    await addRatings(missingImdb.id, false, 3);
    await addRatings(oneSource.id, true, 0);
    await addRatings(twoSources.id, true, 1);
    await addRatings(eligible.id, true, 3);

    const result = await generateRecommendationBatchV1(user.id, prisma);
    const ids = result.cards.map((card) => card.movie.tmdbId);

    expect(ids).toContain(304);
    expect(ids).not.toContain(301);
    expect(ids).not.toContain(302);
    expect(ids).not.toContain(303);
    expect(ids).not.toContain(305);
    expect(result.cards[0]?.movie.posterUrl).toBeTruthy();
    expect(result.cards[0]?.ratings.imdb).toBeDefined();
    expect(result.cards[0]?.ratings.additional.length).toBeGreaterThanOrEqual(1);
  });

  it('allows /api/posters fallback URLs in test mode', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Fallback Poster Test' } });
    const movie = await prisma.movie.create({
      data: {
        tmdbId: 3801,
        title: 'Fallback Poster',
        posterUrl: '/api/posters/3801',
        genres: ['horror'],
      },
    });
    await addRatings(movie.id, true, 3);

    const result = await generateRecommendationBatchV1(user.id, prisma);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.movie.posterUrl).toBe('/api/posters/3801');
  });

  it('refresh generation rotates away from the immediately previous batch', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Rotate' } });

    const movies = await Promise.all(
      Array.from({ length: 12 }).map((_, index) =>
        prisma.movie.create({
          data: {
            tmdbId: 5000 + index,
            title: `Rotate ${index}`,
            year: 1990 + index,
            posterUrl: `https://image.tmdb.org/t/p/w500/r${index}.jpg`,
            genres: ['horror', index % 2 === 0 ? 'slasher' : 'supernatural'],
          },
        }),
      ),
    );
    await Promise.all(movies.map((movie) => addRatings(movie.id)));

    const batchOne = await generateRecommendationBatchV1(user.id, prisma);
    const batchTwo = await generateRecommendationBatchV1(user.id, prisma);

    const batchOneIds = new Set(batchOne.cards.map((card) => card.movie.tmdbId));
    const overlap = batchTwo.cards.filter((card) => batchOneIds.has(card.movie.tmdbId));
    expect(overlap).toHaveLength(0);
  });
});
