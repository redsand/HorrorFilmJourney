import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { UserRepo } from '@/repos/user-repo';
import { MovieRepo } from '@/repos/movie-repo';
import { InteractionRepo } from '@/repos/interaction-repo';
import { BatchRepo } from '@/repos/batch-repo';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('data_model_test');

const prisma = new PrismaClient({
  datasources: {
    db: { url: testDbUrl },
  },
});

const userRepo = new UserRepo(prisma);
const movieRepo = new MovieRepo(prisma);
const interactionRepo = new InteractionRepo(prisma);
const batchRepo = new BatchRepo(prisma);

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

describe('Prisma multi-user model repositories', () => {
  it('creates user with profile', async () => {
    const user = await userRepo.createWithProfile({
      displayName: 'Ripley',
      profile: {
        tolerance: 4,
        pacePreference: 'balanced',
        horrorDNA: { supernatural: 0.7 },
      },
    });

    expect(user.displayName).toBe('Ripley');
    expect(user.profile?.tolerance).toBe(4);
  });

  it('upserts movie by tmdbId', async () => {
    const first = await movieRepo.upsertByTmdbId({
      tmdbId: 550,
      title: 'Se7en',
      year: 1995,
      posterUrl: 'https://img/550.jpg',
    });

    const second = await movieRepo.upsertByTmdbId({
      tmdbId: 550,
      title: 'Se7en (Updated)',
      year: 1995,
      posterUrl: 'https://img/550b.jpg',
    });

    expect(first.id).toBe(second.id);
    expect(second.title).toBe('Se7en (Updated)');
  });

  it('creates interaction tied to user and movie', async () => {
    const user = await userRepo.createWithProfile({
      displayName: 'Sidney',
    });
    const movie = await movieRepo.upsertByTmdbId({
      tmdbId: 603,
      title: 'The Matrix',
      posterUrl: 'https://img/603.jpg',
    });

    const interaction = await interactionRepo.create({
      userId: user.id,
      movieId: movie.id,
      status: 'WATCHED',
      rating: 5,
    });

    expect(interaction.userId).toBe(user.id);
    expect(interaction.movieId).toBe(movie.id);
  });

  it('creates recommendation batch with 5 items for a user', async () => {
    const user = await userRepo.createWithProfile({
      displayName: 'Laurie',
    });

    const movies = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        movieRepo.upsertByTmdbId({ tmdbId: 9000 + n, title: `Movie ${n}`, posterUrl: `https://img/${n}.jpg` }),
      ),
    );

    const batch = await batchRepo.createWithItems({
      userId: user.id,
      journeyNode: 'onboarding',
      items: movies.map((movie, index) => ({
        movieId: movie.id,
        rank: index + 1,
        whyImportant: `Why ${index + 1}`,
        whatItTeaches: `Teaches ${index + 1}`,
        historicalContext: `Context ${index + 1}`,
        nextStepHint: `Next ${index + 1}`,
        watchFor: [`beat-${index + 1}`, 'mood', 'craft'],
        spoilerPolicy: 'light',
      })),
    });

    expect(batch.items).toHaveLength(5);
    expect(batch.items[0]?.rank).toBe(1);
    expect(batch.items[4]?.rank).toBe(5);
  });

  it('queries user history ordered by createdAt desc', async () => {
    const user = await userRepo.createWithProfile({ displayName: 'Ash' });
    const movieA = await movieRepo.upsertByTmdbId({ tmdbId: 101, title: 'A', posterUrl: 'https://img/101.jpg' });
    const movieB = await movieRepo.upsertByTmdbId({ tmdbId: 102, title: 'B', posterUrl: 'https://img/102.jpg' });

    await interactionRepo.create({ userId: user.id, movieId: movieA.id, status: 'WATCHED' });
    await interactionRepo.create({ userId: user.id, movieId: movieB.id, status: 'SKIPPED' });

    const history = await interactionRepo.listByUser(user.id);

    expect(history).toHaveLength(2);
    expect(history[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(history[1]!.createdAt.getTime());
  });
});
