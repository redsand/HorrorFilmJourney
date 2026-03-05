import { PrismaClient } from '@prisma/client';
import { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';
import { buildTestDatabaseUrl, prismaDbPush } from 'tests/helpers/test-db';

const seasons = [
  { slug: 'season-1', name: 'Season 1', packSlug: 'horror', primaryGenre: 'horror', prefix: 7000 },
  { slug: 'season-2', name: 'Season 2', packSlug: 'cult-classics', primaryGenre: 'cult', prefix: 9000 },
];

async function addRatings(prisma: PrismaClient, movieId: string): Promise<void> {
  await prisma.movieRating.createMany({
    data: [
      { movieId, source: 'IMDB', value: 7.8, scale: '10', rawValue: '7.8/10' },
      { movieId, source: 'ROTTEN_TOMATOES', value: 92, scale: '100', rawValue: '92%' },
      { movieId, source: 'METACRITIC', value: 81, scale: '100', rawValue: '81/100' },
    ],
  });
}

async function seedSeason(prisma: PrismaClient, seasonConfig: (typeof seasons)[0]) {
  const season = await prisma.season.create({
    data: { slug: seasonConfig.slug, name: seasonConfig.name, isActive: true },
  });
  const pack = await prisma.genrePack.create({
    data: {
      slug: seasonConfig.packSlug,
      name: `${seasonConfig.packSlug} Pack`,
      seasonId: season.id,
      isEnabled: true,
      primaryGenre: seasonConfig.primaryGenre,
    },
  });
  const node = await prisma.journeyNode.create({
    data: {
      packId: pack.id,
      slug: `${seasonConfig.packSlug}-core`,
      name: `${seasonConfig.packSlug} Core`,
      learningObjective: 'test',
      whatToNotice: ['x'],
      eraSubgenreFocus: 'test',
      spoilerPolicyDefault: 'NO_SPOILERS',
      orderIndex: 1,
    },
  });

  const movies = await Promise.all(
    Array.from({ length: 6 }, (_, index) => {
      const tmdbId = seasonConfig.prefix + index + 1;
      return prisma.movie.create({
        data: {
          tmdbId,
          title: `Curated ${tmdbId}`,
          year: 1990 + index,
          posterUrl: `https://img/${tmdbId}.jpg`,
          genres: [seasonConfig.primaryGenre],
        },
      });
    }),
  );
  await Promise.all(movies.map((movie) => addRatings(prisma, movie.id)));

  await prisma.nodeMovie.createMany({
    data: movies.map((movie, index) => ({
      nodeId: node.id,
      movieId: movie.id,
      rank: index + 1,
      tier: 'CORE',
      score: 0.8,
      finalScore: 0.8,
      journeyScore: 0.8,
      taxonomyVersion: `${seasonConfig.slug}-v1`,
    })),
  });

  const release = await prisma.seasonNodeRelease.create({
    data: {
      seasonId: season.id,
      packId: pack.id,
      taxonomyVersion: `${seasonConfig.slug}-v1`,
      runId: `determinism-${seasonConfig.packSlug}`,
      isPublished: true,
    },
  });
  await prisma.seasonNodeReleaseItem.createMany({
    data: movies.map((movie, index) => ({
      releaseId: release.id,
      nodeSlug: node.slug,
      movieId: movie.id,
      rank: index + 1,
      source: 'curated',
      score: 0.9,
    })),
  });

  return { season, pack, node, movies };
}

async function runTrials(prisma: PrismaClient, userId: string, packId: string, seasonSlug: string, primaryGenre: string, label: string) {
  process.env.REC_ENGINE_MODE = 'modern';
  const sequences: string[] = [];
  for (let run = 0; run < 10; run += 1) {
    const batch = await generateRecommendationBatch(userId, prisma, {
      targetCount: 5,
      packId,
      seasonSlug,
      packPrimaryGenre: primaryGenre,
    });
    const cards = batch.cards.map((card) => `${card.movie.tmdbId}:${card.rank}`);
    sequences.push(cards.join(','));
    console.log(`${label} run ${run + 1}:`, cards);
  }
  const unique = new Set(sequences);
  console.log(`${label} variation: ${unique.size} unique sequences`);
  return { uniqueCount: unique.size, sequences };
}

async function main(): Promise<void> {
  const dbUrl = buildTestDatabaseUrl('recommendation_determinism');
  prismaDbPush(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const results: Record<string, { uniqueCount: number }> = {};
    for (const config of seasons) {
      const { pack } = await seedSeason(prisma, config);
      const user = await prisma.user.create({ data: { displayName: `User ${config.slug}` } });
      await prisma.userProfile.create({
        data: {
          userId: user.id,
          onboardingCompleted: true,
          tolerance: 3,
          selectedPackId: pack.id,
        },
      });
      const trial = await runTrials(prisma, user.id, pack.id, config.slug, pack.primaryGenre, config.slug);
      results[config.slug] = { uniqueCount: trial.uniqueCount };
    }
    console.log('Summary', results);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
