import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('evidence_corpus_models_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  await prisma.evidenceChunk.deleteMany();
  await prisma.evidenceDocument.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();
});

describe('evidence corpus models', () => {
  it('stores documents and chunks linked to movie', async () => {
    const movie = await prisma.movie.create({
      data: {
        tmdbId: 330,
        title: 'Eraserhead',
        posterUrl: 'https://img/330.jpg',
      },
    });

    const doc = await prisma.evidenceDocument.create({
      data: {
        movieId: movie.id,
        seasonSlug: 'season-2',
        sourceName: 'Criterion',
        url: 'https://criterion.com/essay/eraserhead',
        title: 'Eraserhead and Midnight Cinema',
        content: 'A longer article body used for chunking.',
        contentHash: 'hash-doc-330',
      },
    });

    await prisma.evidenceChunk.createMany({
      data: [
        {
          id: 'chunk-1',
          documentId: doc.id,
          chunkIndex: 0,
          text: 'chunk 1',
          charCount: 7,
        },
        {
          id: 'chunk-2',
          documentId: doc.id,
          chunkIndex: 1,
          text: 'chunk 2',
          charCount: 7,
        },
      ],
    });

    const loaded = await prisma.evidenceDocument.findUnique({
      where: { id: doc.id },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });

    expect(loaded?.movieId).toBe(movie.id);
    expect(loaded?.seasonSlug).toBe('season-2');
    expect(loaded?.chunks).toHaveLength(2);
    expect(loaded?.chunks[0]?.text).toBe('chunk 1');
  });
});

