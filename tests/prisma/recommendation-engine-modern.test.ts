import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';
import season1FallbackSpec from '../../docs/season/season-1-fallback-candidates.json';
import season2FallbackSpec from '../../docs/season/season-2-fallback-candidates.json';
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
  delete process.env.EVIDENCE_RETRIEVAL_MODE;
  delete process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX;
  process.env.SEASONS_PACKS_ENABLED = 'true';
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.retrievalRun.deleteMany();
  await prisma.nodeMovie.deleteMany();
  await prisma.journeyNode.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movieEmbedding.deleteMany();
  await prisma.userEmbeddingSnapshot.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.journeyProgress.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.genrePack.deleteMany();
  await prisma.season.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();
});

describe('RecommendationEngine modern mode', () => {
  it('rotates away from the previous batch while enforcing ratings and poster in cards', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Mode User' } });
    const season = await prisma.season.create({ data: { slug: 'season-1', name: 'Season 1', isActive: true } });
    const pack = await prisma.genrePack.create({
      data: { slug: 'horror', name: 'Horror', seasonId: season.id, isEnabled: true, primaryGenre: 'horror' },
    });
    await prisma.userProfile.create({
      data: {
        userId: user.id,
        onboardingCompleted: true,
        tolerance: 3,
        pacePreference: 'balanced',
        selectedPackId: pack.id,
      },
    });

    const movies = await Promise.all(
      [601, 602, 603, 604, 605, 606].map((tmdbId, i) =>
        prisma.movie.create({ data: { tmdbId, title: `Movie ${tmdbId}`, year: 2000 + i, posterUrl: `https://img/${tmdbId}.jpg`, genres: ['horror'] } }),
      ),
    );
    await Promise.all(movies.map((m) => addRatings(m.id)));

    process.env.REC_ENGINE_MODE = 'v1';
    const v1 = await generateRecommendationBatch(user.id, prisma);

    // Assign movies to the effective pack so modern engine can find them
    const effectivePack = await prisma.genrePack.findFirst({ where: { isEnabled: true } });
    if (effectivePack) {
      const node = await prisma.journeyNode.create({
        data: {
          packId: effectivePack.id,
          slug: 'test-node',
          name: 'Test Node',
          learningObjective: 'test',
          whatToNotice: [],
          eraSubgenreFocus: 'test',
          spoilerPolicyDefault: 'NO_SPOILERS',
          orderIndex: 1,
        }
      });
      await prisma.nodeMovie.createMany({
        data: movies.map((m, i) => ({
          nodeId: node.id,
          movieId: m.id,
          rank: i + 1,
          tier: 'CORE'
        }))
      });
    }

    process.env.REC_ENGINE_MODE = 'modern';
    const modern = await generateRecommendationBatch(user.id, prisma);

    const v1Ids = new Set(v1.cards.map((c) => c.movie.tmdbId));
    expect(modern.cards.every((card) => !v1Ids.has(card.movie.tmdbId))).toBe(true);
    expect(modern.cards.length).toBeGreaterThan(0);
    expect(modern.cards.length).toBeLessThanOrEqual(5);
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

  it('uses current journey node curated titles first for Season 1 Horror', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Curriculum User' } });
    const season = await prisma.season.create({ data: { slug: 'season-1', name: 'Season 1', isActive: true } });
    const pack = await prisma.genrePack.create({
      data: { slug: 'horror', name: 'Horror', seasonId: season.id, isEnabled: true, primaryGenre: 'horror' },
    });
    await prisma.userProfile.create({
      data: {
        userId: user.id,
        onboardingCompleted: true,
        tolerance: 3,
        pacePreference: 'balanced',
        selectedPackId: pack.id,
      },
    });

    const curatedMovies = await Promise.all(
      [8101, 8102, 8103, 8104, 8105].map((tmdbId, i) =>
        prisma.movie.create({
          data: { tmdbId, title: `Curated ${tmdbId}`, year: 1990 + i, posterUrl: `https://img/${tmdbId}.jpg`, genres: ['horror'] },
        }),
      ),
    );
    const fallbackMovies = await Promise.all(
      [8201, 8202, 8203, 8204, 8205].map((tmdbId, i) =>
        prisma.movie.create({
          data: { tmdbId, title: `Fallback ${tmdbId}`, year: 2000 + i, posterUrl: `https://img/${tmdbId}.jpg`, genres: ['horror'] },
        }),
      ),
    );
    await Promise.all([...curatedMovies, ...fallbackMovies].map((movie) => addRatings(movie.id)));

    const node = await prisma.journeyNode.create({
      data: {
        packId: pack.id,
        slug: 'psychological-horror',
        name: 'Psychological Horror',
        learningObjective: 'obj',
        whatToNotice: ['a', 'b', 'c'],
        eraSubgenreFocus: '1990s',
        spoilerPolicyDefault: 'NO_SPOILERS',
        orderIndex: 1,
      },
    });
    await prisma.nodeMovie.createMany({
      data: curatedMovies.map((movie, index) => ({ nodeId: node.id, movieId: movie.id, rank: index + 1 })),
    });
    await prisma.journeyProgress.create({
      data: {
        userId: user.id,
        packId: pack.id,
        journeyNode: node.slug,
        completedCount: 1,
        masteryScore: 1,
      },
    });

    process.env.REC_ENGINE_MODE = 'modern';
    const batch = await generateRecommendationBatch(user.id, prisma);
    const ids = batch.cards.map((card) => card.movie.tmdbId);

    expect(ids).toHaveLength(5);
    expect(ids.every((id) => curatedMovies.some((movie) => movie.tmdbId === id))).toBe(true);
  });

  it('avoids repeats from the last 10 recommended titles', async () => {
    const user = await prisma.user.create({ data: { displayName: 'No Repeat User' } });
    const season = await prisma.season.create({ data: { slug: 'season-1', name: 'Season 1', isActive: true } });
    const pack = await prisma.genrePack.create({
      data: { slug: 'horror', name: 'Horror', seasonId: season.id, isEnabled: true, primaryGenre: 'horror' },
    });
    await prisma.userProfile.create({
      data: {
        userId: user.id,
        onboardingCompleted: true,
        tolerance: 3,
        pacePreference: 'balanced',
        selectedPackId: pack.id,
      },
    });

    const movies = await Promise.all(
      Array.from({ length: 15 }, (_, i) => {
        const tmdbId = 9101 + i;
        return prisma.movie.create({
          data: {
            tmdbId,
            title: `Pool ${tmdbId}`,
            year: 1980 + i,
            posterUrl: `https://img/${tmdbId}.jpg`,
            genres: ['horror'],
          },
        });
      }),
    );
    await Promise.all(movies.map((movie) => addRatings(movie.id)));

    process.env.REC_ENGINE_MODE = 'modern';
    const first = await generateRecommendationBatch(user.id, prisma);
    const second = await generateRecommendationBatch(user.id, prisma);
    const third = await generateRecommendationBatch(user.id, prisma);

    const recentTen = new Set([...first.cards, ...second.cards].map((card) => card.movie.tmdbId));
    expect(recentTen.size).toBe(10);
    expect(third.cards).toHaveLength(5);
    expect(third.cards.every((card) => !recentTen.has(card.movie.tmdbId))).toBe(true);
  });

  it('handles enabled cult-classics pack with no seeded cult catalog by returning an empty batch', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Cult Empty User' } });
    const season1 = await prisma.season.create({ data: { slug: 'season-1', name: 'Season 1', isActive: false } });
    const season2 = await prisma.season.create({ data: { slug: 'season-2', name: 'Season 2', isActive: true } });
    await prisma.genrePack.create({
      data: { slug: 'horror', name: 'Horror', seasonId: season1.id, isEnabled: true, primaryGenre: 'horror' },
    });
    const cultPack = await prisma.genrePack.create({
      data: { slug: 'cult-classics', name: 'Cult Classics', seasonId: season2.id, isEnabled: true, primaryGenre: 'cult' },
    });
    await prisma.userProfile.create({
      data: {
        userId: user.id,
        onboardingCompleted: true,
        tolerance: 3,
        pacePreference: 'balanced',
        selectedPackId: cultPack.id,
      },
    });

    const horrorOnlyMovie = await prisma.movie.create({
      data: { tmdbId: 9901, title: 'Horror Only', year: 1988, posterUrl: 'https://img/9901.jpg', genres: ['horror'] },
    });
    await addRatings(horrorOnlyMovie.id);

    process.env.REC_ENGINE_MODE = 'modern';
    const batch = await generateRecommendationBatch(user.id, prisma);
    expect(batch.cards).toHaveLength(0);
  });

  it('returns identical batches when only fallback candidates are available', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Deterministic Fallback User' } });
    const season = await prisma.season.create({ data: { slug: 'season-1', name: 'Season 1', isActive: true } });
    const pack = await prisma.genrePack.create({
      data: { slug: 'horror', name: 'Horror', seasonId: season.id, isEnabled: true, primaryGenre: 'horror' },
    });
    await prisma.userProfile.create({
      data: {
        userId: user.id,
        onboardingCompleted: true,
        tolerance: 3,
        pacePreference: 'balanced',
        selectedPackId: pack.id,
      },
    });

    const fallbackTmdbIds = season1FallbackSpec.tmdbIds.slice(0, 5);
    const fallbackMovies = await Promise.all(
      fallbackTmdbIds.map((tmdbId, index) =>
        prisma.movie.create({
          data: {
            tmdbId,
            title: `Fallback ${tmdbId}`,
            year: 1990 + index,
            posterUrl: `https://img/${tmdbId}.jpg`,
            genres: ['horror'],
          },
        }),
      ),
    );
    await Promise.all(fallbackMovies.map((movie) => addRatings(movie.id)));

    process.env.REC_ENGINE_MODE = 'modern';
    const first = await generateRecommendationBatch(user.id, prisma);
    const second = await generateRecommendationBatch(user.id, prisma);

    const firstIds = first.cards.map((card) => card.movie.tmdbId);
    const secondIds = second.cards.map((card) => card.movie.tmdbId);
    expect(new Set(firstIds)).toEqual(new Set(fallbackTmdbIds));
    expect(firstIds).toEqual(secondIds);
    expect(firstIds.length).toBeGreaterThan(0);
  });

  it('returns deterministic fallback batches for Season 2 cult-classics', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Cult Fallback User' } });
    const season2 = await prisma.season.create({ data: { slug: 'season-2', name: 'Season 2', isActive: true } });
    const cultPack = await prisma.genrePack.create({
      data: { slug: 'cult-classics', name: 'Cult Classics', seasonId: season2.id, isEnabled: true, primaryGenre: 'cult' },
    });
    await prisma.userProfile.create({
      data: {
        userId: user.id,
        onboardingCompleted: true,
        tolerance: 3,
        pacePreference: 'balanced',
        selectedPackId: cultPack.id,
      },
    });

    const fallbackTmdbIds = season2FallbackSpec.tmdbIds.slice(0, 5);
    const fallbackMovies = await Promise.all(
      fallbackTmdbIds.map((tmdbId, index) =>
        prisma.movie.create({
          data: {
            tmdbId,
            title: `Cult Fallback ${tmdbId}`,
            year: 1970 + index,
            posterUrl: `https://img/${tmdbId}.jpg`,
            genres: ['cult'],
          },
        }),
      ),
    );
    await Promise.all(fallbackMovies.map((movie) => addRatings(movie.id)));

    process.env.REC_ENGINE_MODE = 'modern';
    const firstBatch = await generateRecommendationBatch(user.id, prisma);
    const firstIds = firstBatch.cards.map((card) => card.movie.tmdbId);
    expect(new Set(firstIds)).toEqual(new Set(fallbackTmdbIds));

    const secondBatch = await generateRecommendationBatch(user.id, prisma);
    const secondIds = secondBatch.cards.map((card) => card.movie.tmdbId);
    expect(secondIds).toEqual(firstIds);
  });

  it('passes season and pack scope into retrieval runs for modern recommendation evidence', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Retrieval Scope User' } });
    const season = await prisma.season.create({ data: { slug: 'season-1', name: 'Season 1', isActive: true } });
    const pack = await prisma.genrePack.create({
      data: { slug: 'horror', name: 'Horror', seasonId: season.id, isEnabled: true, primaryGenre: 'horror' },
    });
    await prisma.userProfile.create({
      data: {
        userId: user.id,
        onboardingCompleted: true,
        tolerance: 3,
        pacePreference: 'balanced',
        selectedPackId: pack.id,
      },
    });
    const movies = await Promise.all(
      [9401, 9402, 9403, 9404, 9405].map((tmdbId, i) =>
        prisma.movie.create({
          data: { tmdbId, title: `Scope ${tmdbId}`, year: 1970 + i, posterUrl: `https://img/${tmdbId}.jpg`, genres: ['horror'] },
        }),
      ),
    );
    await Promise.all(movies.map((movie) => addRatings(movie.id)));
    await prisma.evidencePacket.createMany({
      data: movies.map((movie, index) => ({
        movieId: movie.id,
        sourceName: `Scope Source ${index + 1}`,
        url: `https://example.test/scope-${index + 1}`,
        snippet: `Scoped packet ${index + 1}`,
      })),
    });

    process.env.REC_ENGINE_MODE = 'modern';
    process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
    process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX = 'false';
    await generateRecommendationBatch(user.id, prisma);

    const runs = await prisma.retrievalRun.findMany({
      orderBy: { createdAt: 'desc' },
      select: { seasonSlug: true, packId: true, queryText: true },
    });
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((run) => run.seasonSlug === 'season-1')).toBe(true);
    expect(runs.every((run) => run.packId === pack.id)).toBe(true);
    expect(runs.every((run) => typeof run.queryText === 'string' && run.queryText.length > 0)).toBe(true);
  });
});
