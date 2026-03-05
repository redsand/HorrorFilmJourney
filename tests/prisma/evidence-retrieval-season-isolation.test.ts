import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createConfiguredEvidenceRetriever } from '@/lib/evidence/retrieval';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('evidence_retrieval_season_isolation');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
  process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX = 'false';
  await prisma.retrievalRun.deleteMany();
  await prisma.externalReadingCuration.deleteMany();
  await prisma.evidenceChunk.deleteMany();
  await prisma.evidenceDocument.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.genrePack.deleteMany();
  await prisma.season.deleteMany();
  await prisma.movie.deleteMany();
});

describe('evidence retrieval season isolation', () => {
  it('returns season-matching evidence for the same movie across two seasons', async () => {
    const movie = await prisma.movie.create({
      data: {
        tmdbId: 45555,
        title: 'Shared Season Fixture',
        year: 1984,
        posterUrl: 'https://img/45555.jpg',
        genres: ['horror'],
      },
    });
    const season1 = await prisma.season.create({ data: { slug: 'season-1', name: 'Season 1', isActive: true } });
    const season2 = await prisma.season.create({ data: { slug: 'season-2', name: 'Season 2', isActive: false } });

    const season1Doc = await prisma.evidenceDocument.create({
      data: {
        movieId: movie.id,
        seasonSlug: 'season-1',
        sourceName: 'Season 1 Dossier',
        url: 'https://example.test/season-1-dossier',
        title: 'Season 1 Dossier',
        content: 'Season 1 only context',
        contentHash: 'hash_s1',
      },
    });
    const season2Doc = await prisma.evidenceDocument.create({
      data: {
        movieId: movie.id,
        seasonSlug: 'season-2',
        sourceName: 'Season 2 Dossier',
        url: 'https://example.test/season-2-dossier',
        title: 'Season 2 Dossier',
        content: 'Season 2 only context',
        contentHash: 'hash_s2',
      },
    });
    await prisma.evidenceChunk.createMany({
      data: [
        {
          id: 'chunk_s1_1',
          documentId: season1Doc.id,
          chunkIndex: 0,
          text: 'Season 1 chunk evidence',
          charCount: 24,
        },
        {
          id: 'chunk_s2_1',
          documentId: season2Doc.id,
          chunkIndex: 0,
          text: 'Season 2 chunk evidence',
          charCount: 24,
        },
      ],
    });
    await prisma.externalReadingCuration.createMany({
      data: [
        {
          movieId: movie.id,
          seasonId: season1.id,
          sourceName: 'Season 1 Essay',
          articleTitle: 'Season 1 editorial framing',
          url: 'https://example.test/s1-essay',
          sourceType: 'ESSAY',
        },
        {
          movieId: movie.id,
          seasonId: season2.id,
          sourceName: 'Season 2 Essay',
          articleTitle: 'Season 2 editorial framing',
          url: 'https://example.test/s2-essay',
          sourceType: 'ESSAY',
        },
      ],
    });

    const retriever = createConfiguredEvidenceRetriever(prisma as never);

    const season1Evidence = await retriever.getEvidenceForMovie(movie.id, {
      seasonSlug: 'season-1',
      query: 'season one context',
      requireSeasonContext: true,
      callerId: 'test:integration',
      topK: 8,
    });
    const season2Evidence = await retriever.getEvidenceForMovie(movie.id, {
      seasonSlug: 'season-2',
      query: 'season two context',
      requireSeasonContext: true,
      callerId: 'test:integration',
      topK: 8,
    });

    expect(season1Evidence.length).toBeGreaterThan(0);
    expect(season2Evidence.length).toBeGreaterThan(0);
    expect(season1Evidence.every((item) => item.provenance?.seasonSlug === 'season-1')).toBe(true);
    expect(season2Evidence.every((item) => item.provenance?.seasonSlug === 'season-2')).toBe(true);
    expect(season1Evidence.some((item) => item.snippet.includes('Season 1'))).toBe(true);
    expect(season2Evidence.some((item) => item.snippet.includes('Season 2'))).toBe(true);
  });
});
