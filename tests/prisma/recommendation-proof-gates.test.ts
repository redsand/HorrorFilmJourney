import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InteractionStatus, PrismaClient } from '@prisma/client';
import { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('recommendation_proof_gates_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

async function addRatings(movieId: string, popularity = 50): Promise<void> {
  await prisma.movieRating.createMany({
    data: [
      { movieId, source: 'IMDB', value: 7.5, scale: '10', rawValue: '7.5/10' },
      { movieId, source: 'ROTTEN_TOMATOES', value: 80, scale: '100', rawValue: '80%' },
      { movieId, source: 'METACRITIC', value: 72, scale: '100', rawValue: '72/100' },
      { movieId, source: 'TMDB_POPULARITY', value: popularity, scale: '100', rawValue: `${popularity}/100` },
    ],
  });
}

async function addCustomRatings(
  movieId: string,
  values: { imdb: number; rotten: number; metacritic: number; popularity: number },
): Promise<void> {
  await prisma.movieRating.createMany({
    data: [
      { movieId, source: 'IMDB', value: values.imdb, scale: '10', rawValue: `${values.imdb}/10` },
      { movieId, source: 'ROTTEN_TOMATOES', value: values.rotten, scale: '100', rawValue: `${values.rotten}%` },
      { movieId, source: 'METACRITIC', value: values.metacritic, scale: '100', rawValue: `${values.metacritic}/100` },
      { movieId, source: 'TMDB_POPULARITY', value: values.popularity, scale: '100', rawValue: `${values.popularity}/100` },
    ],
  });
}

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  process.env.REC_ENGINE_MODE = 'modern';
  delete process.env.LLM_PROVIDER;
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

describe('Recommendation proof gates', () => {
  it('determinism: same user state + same snapshot yields same top-5 ids', async () => {
    const userA = await prisma.user.create({
      data: {
        displayName: 'Determinism A',
        profile: { create: { onboardingCompleted: true, tolerance: 3, pacePreference: 'balanced' } },
      },
    });
    const userB = await prisma.user.create({
      data: {
        displayName: 'Determinism B',
        profile: { create: { onboardingCompleted: true, tolerance: 3, pacePreference: 'balanced' } },
      },
    });

    for (let i = 0; i < 14; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const movie = await prisma.movie.create({
        data: {
          tmdbId: 20000 + i,
          title: `Determinism Movie ${i}`,
          year: 1980 + i,
          posterUrl: `https://image.tmdb.org/t/p/w500/determinism_${i}.jpg`,
          posterLastValidatedAt: new Date(),
          genres: i % 2 === 0 ? ['psychological', 'horror'] : ['slasher', 'horror'],
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await addRatings(movie.id, 40 + i);
    }

    const batchA = await generateRecommendationBatch(userA.id, prisma);
    const batchB = await generateRecommendationBatch(userB.id, prisma);
    expect(batchA.cards.map((card) => card.movie.tmdbId)).toEqual(batchB.cards.map((card) => card.movie.tmdbId));
  });

  it('personalization gate: opposing histories diverge from random overlap', async () => {
    const userSlow = await prisma.user.create({
      data: {
        displayName: 'Slowburn Fan',
        profile: { create: { onboardingCompleted: true, tolerance: 2, pacePreference: 'slowburn' } },
      },
    });
    const userShock = await prisma.user.create({
      data: {
        displayName: 'Shock Fan',
        profile: { create: { onboardingCompleted: true, tolerance: 5, pacePreference: 'shock' } },
      },
    });

    const slowMovies: Array<{ id: string; tmdbId: number }> = [];
    const shockMovies: Array<{ id: string; tmdbId: number }> = [];

    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const slow = await prisma.movie.create({
        data: {
          tmdbId: 21000 + i,
          title: `Slow Movie ${i}`,
          year: 1970 + i,
          posterUrl: `https://image.tmdb.org/t/p/w500/slow_${i}.jpg`,
          posterLastValidatedAt: new Date(),
          genres: ['psychological', 'gothic', 'horror'],
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await addRatings(slow.id, 35 + i);
      slowMovies.push({ id: slow.id, tmdbId: slow.tmdbId });

      // eslint-disable-next-line no-await-in-loop
      const shock = await prisma.movie.create({
        data: {
          tmdbId: 22000 + i,
          title: `Shock Movie ${i}`,
          year: 1990 + i,
          posterUrl: `https://image.tmdb.org/t/p/w500/shock_${i}.jpg`,
          posterLastValidatedAt: new Date(),
          genres: ['slasher', 'body-horror', 'horror'],
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await addRatings(shock.id, 60 + i);
      shockMovies.push({ id: shock.id, tmdbId: shock.tmdbId });
    }

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.userMovieInteraction.create({
        data: {
          userId: userSlow.id,
          movieId: slowMovies[i]!.id,
          status: InteractionStatus.WATCHED,
          rating: 5,
          recommend: true,
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await prisma.userMovieInteraction.create({
        data: {
          userId: userSlow.id,
          movieId: shockMovies[i]!.id,
          status: InteractionStatus.SKIPPED,
          rating: 1,
          recommend: false,
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await prisma.userMovieInteraction.create({
        data: {
          userId: userShock.id,
          movieId: shockMovies[i]!.id,
          status: InteractionStatus.WATCHED,
          rating: 5,
          recommend: true,
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await prisma.userMovieInteraction.create({
        data: {
          userId: userShock.id,
          movieId: slowMovies[i]!.id,
          status: InteractionStatus.SKIPPED,
          rating: 1,
          recommend: false,
        },
      });
    }

    const slowBatch = await generateRecommendationBatch(userSlow.id, prisma);
    const shockBatch = await generateRecommendationBatch(userShock.id, prisma);

    const slowPreferred = slowBatch.cards.filter((card) =>
      card.movie.genres.includes('psychological') || card.movie.genres.includes('gothic')).length;
    const shockPreferred = shockBatch.cards.filter((card) =>
      card.movie.genres.includes('slasher') || card.movie.genres.includes('body-horror')).length;
    expect(slowPreferred).toBeGreaterThanOrEqual(3);
    expect(shockPreferred).toBeGreaterThanOrEqual(3);

    const overlap = slowBatch.cards
      .map((card) => card.movie.tmdbId)
      .filter((tmdbId) => shockBatch.cards.some((card) => card.movie.tmdbId === tmdbId)).length;
    expect(overlap).toBeLessThanOrEqual(2);
  });

  it('preference gate: popularity setting favors high-popularity titles over diversity default', async () => {
    const userDiversity = await prisma.user.create({
      data: {
        displayName: 'Diversity User',
        profile: {
          create: {
            onboardingCompleted: true,
            tolerance: 3,
            pacePreference: 'balanced',
            horrorDNA: { recommendationStyle: 'diversity' },
          },
        },
      },
    });
    const userPopularity = await prisma.user.create({
      data: {
        displayName: 'Popularity User',
        profile: {
          create: {
            onboardingCompleted: true,
            tolerance: 3,
            pacePreference: 'balanced',
            horrorDNA: { recommendationStyle: 'popularity' },
          },
        },
      },
    });

    for (let i = 0; i < 10; i += 1) {
      const movie = await prisma.movie.create({
        data: {
          tmdbId: 23000 + i,
          title: `Popularity Mix ${i}`,
          year: 1980 + i,
          posterUrl: `https://image.tmdb.org/t/p/w500/popmix_${i}.jpg`,
          posterLastValidatedAt: new Date(),
          genres: i < 5 ? ['gothic', 'horror'] : ['slasher', 'horror'],
        },
      });
      await addRatings(movie.id, 20 + i * 8);
    }

    const diversityBatch = await generateRecommendationBatch(userDiversity.id, prisma);
    const popularityBatch = await generateRecommendationBatch(userPopularity.id, prisma);
    const avgPopularity = (batch: typeof diversityBatch) => {
      const popularityScores = batch.cards.map((card) => {
        const pop = card.ratings.additional.find((r) => r.source === 'TMDB_POPULARITY');
        return pop?.value ?? 0;
      });
      return popularityScores.reduce((sum, v) => sum + v, 0) / popularityScores.length;
    };

    expect(avgPopularity(popularityBatch)).toBeGreaterThanOrEqual(avgPopularity(diversityBatch));
  });

  it('popularity scoring blends trend and quality (not TMDB-only)', async () => {
    const userPopularity = await prisma.user.create({
      data: {
        displayName: 'Popularity Blend User',
        profile: {
          create: {
            onboardingCompleted: true,
            tolerance: 3,
            pacePreference: 'balanced',
            horrorDNA: { recommendationStyle: 'popularity' },
          },
        },
      },
    });

    const lowQualityHighTrend = await prisma.movie.create({
      data: {
        tmdbId: 24001,
        title: 'Low Quality High Trend',
        year: 2019,
        posterUrl: 'https://image.tmdb.org/t/p/w500/low_quality_high_trend.jpg',
        posterLastValidatedAt: new Date(),
        genres: ['horror', 'thriller'],
      },
    });
    await addCustomRatings(lowQualityHighTrend.id, { imdb: 4.2, rotten: 22, metacritic: 31, popularity: 95 });

    const strongQualityModerateTrend = await prisma.movie.create({
      data: {
        tmdbId: 24002,
        title: 'Strong Quality Moderate Trend',
        year: 2018,
        posterUrl: 'https://image.tmdb.org/t/p/w500/strong_quality_moderate_trend.jpg',
        posterLastValidatedAt: new Date(),
        genres: ['horror', 'thriller'],
      },
    });
    await addCustomRatings(strongQualityModerateTrend.id, { imdb: 8.6, rotten: 91, metacritic: 86, popularity: 70 });

    for (let i = 0; i < 6; i += 1) {
      const filler = await prisma.movie.create({
        data: {
          tmdbId: 24010 + i,
          title: `Blend Filler ${i}`,
          year: 2000 + i,
          posterUrl: `https://image.tmdb.org/t/p/w500/blend_filler_${i}.jpg`,
          posterLastValidatedAt: new Date(),
          genres: ['horror', 'thriller'],
        },
      });
      await addCustomRatings(filler.id, { imdb: 6.8, rotten: 68, metacritic: 64, popularity: 65 + i });
    }

    const batch = await generateRecommendationBatch(userPopularity.id, prisma);
    const ids = batch.cards.map((card) => card.movie.tmdbId);
    const lowQualityIndex = ids.indexOf(lowQualityHighTrend.tmdbId);
    const strongQualityIndex = ids.indexOf(strongQualityModerateTrend.tmdbId);

    expect(lowQualityIndex).toBeGreaterThanOrEqual(0);
    expect(strongQualityIndex).toBeGreaterThanOrEqual(0);
    expect(strongQualityIndex).toBeLessThan(lowQualityIndex);
  });
});
