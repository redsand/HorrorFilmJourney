import { existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { InteractionStatus, PrismaClient } from '@prisma/client';

export const acceptanceDbPath = 'prisma/test-recommendations-acceptance.db';
export const acceptanceDbUrl = `file:${acceptanceDbPath}`;

export function createAcceptancePrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: acceptanceDbUrl } } });
}

export function setupAcceptanceDatabase(): void {
  if (existsSync(acceptanceDbPath)) rmSync(acceptanceDbPath);
  execSync(`DATABASE_URL=${acceptanceDbUrl} npx prisma db push --skip-generate`, { stdio: 'inherit' });
}

export async function resetAcceptanceDatabase(prisma: PrismaClient): Promise<void> {
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
}

export async function seedRecommendationAcceptance(prisma: PrismaClient): Promise<{
  userAId: string;
  userBId: string;
}> {
  const userA = await prisma.user.create({ data: { displayName: 'userA' } });
  const userB = await prisma.user.create({ data: { displayName: 'userB' } });

  const movies = await Promise.all(
    [801, 802, 803, 804, 805, 806, 807, 808].map((tmdbId, index) =>
      prisma.movie.create({
        data: {
          tmdbId,
          title: `Acceptance Movie ${tmdbId}`,
          year: 1990 + index,
          posterUrl: `https://image.tmdb.org/t/p/w500/${tmdbId}.jpg`,
          genres: ['horror', index % 2 === 0 ? 'psychological' : 'supernatural'],
        },
      }),
    ),
  );

  await Promise.all(
    movies.map((movie, index) =>
      prisma.movieRating.createMany({
        data: [
          { movieId: movie.id, source: 'IMDB', value: 7.1 + index * 0.1, scale: '10', rawValue: `${(7.1 + index * 0.1).toFixed(1)}/10` },
          { movieId: movie.id, source: 'ROTTEN_TOMATOES', value: 70 + index, scale: '100', rawValue: `${70 + index}%` },
        ],
      }),
    ),
  );

  await Promise.all(
    movies.map((movie, index) =>
      prisma.evidencePacket.create({
        data: {
          movieId: movie.id,
          sourceName: 'SeedSource',
          url: `https://example.com/movies/${movie.tmdbId}`,
          snippet: `Seed evidence snippet ${index + 1}`,
          retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    ),
  );

  await prisma.userMovieInteraction.create({
    data: {
      userId: userA.id,
      movieId: movies[0]!.id,
      status: InteractionStatus.WATCHED,
      rating: 4,
    },
  });

  await prisma.userMovieInteraction.create({
    data: {
      userId: userB.id,
      movieId: movies[1]!.id,
      status: InteractionStatus.WATCHED,
      rating: 5,
    },
  });

  return { userAId: userA.id, userBId: userB.id };
}
