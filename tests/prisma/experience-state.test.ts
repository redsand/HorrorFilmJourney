import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { getExperience } from '@/lib/experience-state';

const testDbPath = 'prisma/test-experience.db';
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

describe('experience state decisions', () => {
  it('returns ONBOARDING_NEEDED when user has no profile', async () => {
    const user = await prisma.user.create({ data: { displayName: 'NoProfile User' } });

    const result = await getExperience(user.id, prisma);

    expect(result.state).toBe('ONBOARDING_NEEDED');
    expect(result.onboardingQuestions?.length).toBeGreaterThan(0);
  });

  it('returns SHOW_RECOMMENDATION_BUNDLE when user has profile but no batch', async () => {
    const user = await prisma.user.create({
      data: {
        displayName: 'Profile User',
        profile: { create: { tolerance: 3 } },
      },
      include: { profile: true },
    });

    const result = await getExperience(user.id, prisma);

    expect(result.state).toBe('SHOW_RECOMMENDATION_BUNDLE');
  });

  it('returns SHOW_RECOMMENDATION_BUNDLE with cards when user has profile and batch', async () => {
    const user = await prisma.user.create({
      data: {
        displayName: 'Batch User',
        profile: { create: { tolerance: 4 } },
      },
    });

    const movie = await prisma.movie.create({
      data: { tmdbId: 12345, title: 'The Thing', year: 1982, posterUrl: 'https://img/thing.jpg' },
    });

    await prisma.recommendationBatch.create({
      data: {
        userId: user.id,
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
