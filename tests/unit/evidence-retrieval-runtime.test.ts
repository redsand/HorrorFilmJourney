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
    expect(result.every((item) => item.provenance?.retrievalMode === 'hybrid')).toBe(true);
    expect(result.some((item) => item.provenance?.sourceType === 'packet')).toBe(true);
    expect(result.some((item) => item.provenance?.sourceType === 'external_reading')).toBe(true);
    expect(result.some((item) => item.provenance?.sourceType === 'chunk')).toBe(true);
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
    expect(result[0]?.provenance).toEqual(expect.objectContaining({
      retrievalMode: 'cache',
      sourceType: 'packet',
      fallbackUsed: true,
      fallbackReason: 'hybrid-error',
    }));
  });

  it('shadow mode returns cache evidence while still executing hybrid retrieval diagnostics', async () => {
    process.env.EVIDENCE_RETRIEVAL_MODE = 'shadow';
    const evidenceFindMany = vi.fn().mockResolvedValue([
      {
        sourceName: 'Wikipedia',
        url: 'https://wikipedia.test/film',
        snippet: 'Cache packet result.',
        retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const externalFindMany = vi.fn().mockResolvedValue([
      {
        sourceName: 'Criterion',
        url: 'https://criterion.test/essay',
        articleTitle: 'Hybrid-only context',
        publicationDate: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const retrievalRunCreate = vi.fn().mockResolvedValue({ id: 'shadow_run_1' });
    const prisma = {
      evidencePacket: { findMany: evidenceFindMany },
      externalReadingCuration: { findMany: externalFindMany },
      retrievalRun: { create: retrievalRunCreate },
    } as const;

    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    const result = await retriever.getEvidenceForMovie('movie_shadow', {
      seasonSlug: 'season-1',
      query: 'shadow validation',
      topK: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceName).toBe('Wikipedia');
    expect(result[0]?.provenance?.retrievalMode).toBe('cache');
    expect(externalFindMany).toHaveBeenCalledTimes(1);
    expect(retrievalRunCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        mode: 'shadow',
      }),
    }));
  });

  it('returns no evidence and logs when season context is missing without explicit global scope', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const evidenceFindMany = vi.fn().mockResolvedValue([
      {
        sourceName: 'Wikipedia',
        url: 'https://wikipedia.test/film',
        snippet: 'Should never load without season scope.',
        retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const prisma = {
      evidencePacket: { findMany: evidenceFindMany },
      externalReadingCuration: { findMany: vi.fn().mockResolvedValue([]) },
    } as const;

    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    const result = await retriever.getEvidenceForMovie('movie_1', {
      query: 'missing scope',
      callerId: 'test:missing-season',
    });

    expect(result).toEqual([]);
    expect(evidenceFindMany).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('RAG_MISSING_SEASON_CONTEXT', expect.objectContaining({
      callerId: 'test:missing-season',
    }));
    consoleErrorSpy.mockRestore();
  });

  it('drops cross-season chunks and logs contamination when a candidate season mismatches the query season', async () => {
    process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prisma = {
      evidencePacket: { findMany: vi.fn().mockResolvedValue([]) },
      externalReadingCuration: { findMany: vi.fn().mockResolvedValue([]) },
      evidenceChunk: {
        findMany: vi.fn().mockResolvedValue([
          {
            text: 'Wrong-season evidence should be dropped.',
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            document: {
              id: 'doc_wrong',
              seasonSlug: 'season-2',
              sourceName: 'Cross Season Source',
              url: 'https://example.test/wrong',
            },
          },
        ]),
      },
    } as const;

    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    const result = await retriever.getEvidenceForMovie('movie_1', {
      seasonSlug: 'season-1',
      query: 'season isolation',
      callerId: 'test:contamination',
    });

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('RAG_SEASON_CONTAMINATION', expect.objectContaining({
      querySeasonSlug: 'season-1',
      chunkDocumentId: 'doc_wrong',
      chunkSeasonSlug: 'season-2',
      callerId: 'test:contamination',
    }));
    consoleErrorSpy.mockRestore();
  });
});
