import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const testDbPath = 'prisma/test-modern-models.db';
const testDbUrl = `file:${testDbPath}`;

const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

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

describe('ModernRecSys migration models', () => {
  it('inserts and retrieves movie embeddings', async () => {
    const movie = await prisma.movie.create({ data: { tmdbId: 777, title: 'Embedding Test', posterUrl: 'https://img/777.jpg' } });

    await prisma.movieEmbedding.create({
      data: {
        movieId: movie.id,
        model: 'text-embedding-3-large',
        dim: 4,
        vectorJson: [0.1, 0.2, 0.3, 0.4],
      },
    });

    const embedding = await prisma.movieEmbedding.findUnique({ where: { movieId: movie.id } });
    expect(embedding?.dim).toBe(4);
    expect(embedding?.vectorJson).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('links evidence packets to a movie', async () => {
    const movie = await prisma.movie.create({ data: { tmdbId: 778, title: 'Evidence Test', posterUrl: 'https://img/778.jpg' } });

    await prisma.evidencePacket.create({
      data: {
        movieId: movie.id,
        sourceName: 'Wikipedia',
        url: 'https://example.com/movie',
        snippet: 'Production context snippet for RAG narrative.',
        hash: 'evidence-778',
      },
    });

    const withEvidence = await prisma.movie.findUnique({ where: { id: movie.id }, include: { evidencePackets: true } });
    expect(withEvidence?.evidencePackets).toHaveLength(1);
    expect(withEvidence?.evidencePackets[0]?.sourceName).toBe('Wikipedia');
  });

  it('stores user embedding snapshots over time', async () => {
    const user = await prisma.user.create({ data: { displayName: 'Snapshot User' } });

    await prisma.userEmbeddingSnapshot.create({
      data: {
        userId: user.id,
        model: 'text-embedding-3-large',
        dim: 3,
        vectorJson: [0.9, 0.8, 0.7],
        computedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.userEmbeddingSnapshot.create({
      data: {
        userId: user.id,
        model: 'text-embedding-3-large',
        dim: 3,
        vectorJson: [0.1, 0.2, 0.3],
        computedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    });

    const snapshots = await prisma.userEmbeddingSnapshot.findMany({
      where: { userId: user.id },
      orderBy: { computedAt: 'asc' },
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.vectorJson).toEqual([0.9, 0.8, 0.7]);
    expect(snapshots[1]?.vectorJson).toEqual([0.1, 0.2, 0.3]);
  });
});
