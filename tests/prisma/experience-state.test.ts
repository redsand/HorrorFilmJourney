import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getExperience } from '@/lib/experience-state';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('experience_state_test');

const prisma = new PrismaClient({
  datasources: {
    db: { url: testDbUrl },
  },
});

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  process.env.SEASONS_PACKS_ENABLED = 'false';
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.journeyProgress.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movieEmbedding.deleteMany();
  await prisma.userEmbeddingSnapshot.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.genrePack.deleteMany();
  await prisma.season.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();
});

describe('experience state decisions', () => {
  it('returns PACK_SELECTION_NEEDED when user has no profile', async () => {
    const user = await prisma.user.create({ data: { displayName: 'NoProfile User' } });

    const result = await getExperience(user.id, prisma);

    expect(result.state).toBe('PACK_SELECTION_NEEDED');
    expect(result.packSelection?.packs.length).toBeGreaterThan(0);
  });

  it('returns PACK_SELECTION_NEEDED when profile exists but onboarding is not completed and no pack is selected', async () => {
    const user = await prisma.user.create({
      data: {
        displayName: 'Profile User',
        profile: { create: { tolerance: 3, pacePreference: 'balanced', onboardingCompleted: false } },
      },
      include: { profile: true },
    });

    const result = await getExperience(user.id, prisma);

    expect(result.state).toBe('PACK_SELECTION_NEEDED');
  });

  it('returns SHOW_RECOMMENDATION_BUNDLE when onboarding is completed and user has no batch', async () => {
    const user = await prisma.user.create({
      data: {
        displayName: 'Completed User',
        profile: { create: { tolerance: 3, pacePreference: 'balanced', onboardingCompleted: true } },
      },
      include: { profile: true },
    });

    const result = await getExperience(user.id, prisma);

    expect(result.state).toBe('SHOW_RECOMMENDATION_BUNDLE');
  });

  it('returns PACK_SELECTION_NEEDED when seasons/packs is enabled and selectedPackId is missing', async () => {
    process.env.SEASONS_PACKS_ENABLED = 'true';
    const season = await prisma.season.create({
      data: { slug: 'season-1', name: 'Season 1', isActive: true },
    });
    await prisma.genrePack.create({
      data: {
        slug: 'horror',
        name: 'Horror',
        seasonId: season.id,
        isEnabled: true,
        primaryGenre: 'horror',
      },
    });
    const user = await prisma.user.create({
      data: {
        displayName: 'Needs Pack',
        profile: { create: { tolerance: 3, pacePreference: 'balanced', onboardingCompleted: false } },
      },
    });

    const result = await getExperience(user.id, prisma);
    expect(result.state).toBe('PACK_SELECTION_NEEDED');
    expect(result.packSelection?.packs[0]?.slug).toBe('horror');
  });

  it('does not include disabled packs in onboarding pack selection', async () => {
    process.env.SEASONS_PACKS_ENABLED = 'true';
    const season = await prisma.season.create({
      data: { slug: 'season-1', name: 'Season 1', isActive: true },
    });
    await prisma.genrePack.createMany({
      data: [
        {
          slug: 'horror',
          name: 'Horror',
          seasonId: season.id,
          isEnabled: true,
          primaryGenre: 'horror',
        },
        {
          slug: 'cult-classics',
          name: 'Cult Classics',
          seasonId: season.id,
          isEnabled: false,
          primaryGenre: 'cult',
        },
      ],
    });
    const user = await prisma.user.create({
      data: {
        displayName: 'Hidden Disabled Pack',
        profile: { create: { tolerance: 3, pacePreference: 'balanced', onboardingCompleted: false } },
      },
    });

    const result = await getExperience(user.id, prisma);
    expect(result.state).toBe('PACK_SELECTION_NEEDED');
    expect(result.packSelection?.packs.map((pack) => pack.slug)).toEqual(['horror']);
  });

  it('returns SHOW_RECOMMENDATION_BUNDLE with cards when user has profile and batch', async () => {
    const season = await prisma.season.create({
      data: { slug: 'season-1', name: 'Season 1', isActive: true },
    });
    const pack = await prisma.genrePack.create({
      data: {
        slug: 'horror',
        name: 'Horror',
        seasonId: season.id,
        isEnabled: true,
        primaryGenre: 'horror',
      },
    });
    const user = await prisma.user.create({
      data: {
        displayName: 'Batch User',
        profile: {
          create: {
            tolerance: 4,
            pacePreference: 'balanced',
            onboardingCompleted: true,
            selectedPackId: pack.id,
          },
        },
      },
    });

    const movie = await prisma.movie.create({
      data: { tmdbId: 12345, title: 'The Thing', year: 1982, posterUrl: 'https://img/thing.jpg' },
    });

    await prisma.recommendationBatch.create({
      data: {
        userId: user.id,
        packId: pack.id,
        journeyNode: 'node-1',
        items: {
          create: {
            movieId: movie.id,
            rank: 1,
            whyImportant: 'Foundational paranoia horror.',
            whatItTeaches: 'Tension through mistrust.',
            historicalContext: 'A landmark in practical effects.',
            nextStepHint: 'Next explore sci-fi dread.',
            watchFor: ['effects', 'ensemble', 'score'],
            spoilerPolicy: 'LIGHT',
          },
        },
      },
    });

    const result = await getExperience(user.id, prisma);

    expect(result.state).toBe('SHOW_RECOMMENDATION_BUNDLE');
    expect(result.bundle?.cards).toHaveLength(1);
    expect(result.bundle?.cards[0]?.movie.title).toBe('The Thing');
  });
});
