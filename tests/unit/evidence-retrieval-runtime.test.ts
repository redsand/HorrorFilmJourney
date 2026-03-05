import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConfiguredEvidenceRetriever } from '@/lib/evidence/retrieval';

describe('evidence retrieval runtime', () => {
  afterEach(() => {
    delete process.env.EVIDENCE_RETRIEVAL_MODE;
    delete process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX;
  });

  it('hybrid mode merges packet and season-scoped external reading evidence', async () => {
    process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
    const evidenceFindMany = vi.fn().mockResolvedValue([
      {
        sourceName: 'IMDb Editorial',
        url: 'https://imdb.test/editorial',
        snippet: 'Cult midnight reception and fan ritual context.',
        retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const externalFindMany = vi.fn().mockResolvedValue([
      {
        sourceName: 'Criterion',
        url: 'https://criterion.test/essay',
        articleTitle: 'On midnight movie lineage',
        publicationDate: new Date('2025-12-31T00:00:00.000Z'),
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    const chunkFindMany = vi.fn().mockResolvedValue([
      {
        id: 'chunk_1',
        text: 'Industrial dread texture and midnight audience ritual.',
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        document: {
          sourceName: 'Criterion',
          url: 'https://criterion.test/essay',
        },
      },
    ]);
    const prisma = {
      evidencePacket: { findMany: evidenceFindMany },
      externalReadingCuration: { findMany: externalFindMany },
      evidenceChunk: { findMany: chunkFindMany },
    } as const;

    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    const result = await retriever.getEvidenceForMovie('movie_1', {
      seasonSlug: 'season-2',
      query: 'cult midnight',
      topK: 5,
    });

    expect(result.length).toBe(3);
    expect(result.some((item) => item.sourceName === 'Criterion')).toBe(true);
    expect(externalFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        movieId: 'movie_1',
      }),
    }));
    expect(chunkFindMany).toHaveBeenCalledTimes(1);
  });

  it('falls back to cache retrieval when hybrid path errors and index is not required', async () => {
    process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
    process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX = 'false';
    const evidenceFindMany = vi.fn().mockResolvedValue([
      {
        sourceName: 'Wikipedia',
        url: 'https://wikipedia.test/film',
        snippet: 'A reliable cache packet.',
        retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const externalFindMany = vi.fn().mockRejectedValue(new Error('db unavailable'));
    const chunkFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      evidencePacket: { findMany: evidenceFindMany },
      externalReadingCuration: { findMany: externalFindMany },
      evidenceChunk: { findMany: chunkFindMany },
    } as const;

    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    const result = await retriever.getEvidenceForMovie('movie_2', {
      seasonSlug: 'season-1',
      query: 'history',
      topK: 3,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceName).toBe('Wikipedia');
  });
});
