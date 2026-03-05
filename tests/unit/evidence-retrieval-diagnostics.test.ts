import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConfiguredEvidenceRetriever } from '@/lib/evidence/retrieval';

describe('evidence retrieval diagnostics', () => {
  afterEach(() => {
    delete process.env.EVIDENCE_RETRIEVAL_MODE;
    delete process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX;
  });

  it('writes a retrieval run for successful hybrid retrieval', async () => {
    process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
    const retrievalRunCreate = vi.fn().mockResolvedValue({ id: 'run_1' });
    const prisma = {
      evidencePacket: {
        findMany: vi.fn().mockResolvedValue([
          {
            sourceName: 'Wikipedia',
            url: 'https://example.com/wiki',
            snippet: 'Classic reception context and production notes.',
            retrievedAt: new Date('2026-03-04T00:00:00.000Z'),
          },
        ]),
      },
      externalReadingCuration: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      retrievalRun: {
        create: retrievalRunCreate,
      },
    } as const;

    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    const result = await retriever.getEvidenceForMovie('movie_1', {
      seasonSlug: 'season-1',
      packId: 'pack_horror',
      query: 'production reception',
      topK: 5,
    });

    expect(result).toHaveLength(1);
    expect(retrievalRunCreate).toHaveBeenCalledTimes(1);
    expect(retrievalRunCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        movieId: 'movie_1',
        mode: 'hybrid',
        fallbackUsed: false,
        selectedCount: 1,
        seasonSlug: 'season-1',
        packId: 'pack_horror',
        duplicateRate: 0,
        citationValidRate: 1,
      }),
    }));
  });

  it('writes fallback diagnostics when hybrid retrieval errors', async () => {
    process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
    process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX = 'false';
    const retrievalRunCreate = vi.fn().mockResolvedValue({ id: 'run_2' });
    const prisma = {
      evidencePacket: {
        findMany: vi.fn().mockResolvedValue([
          {
            sourceName: 'IMDb Editorial',
            url: 'https://example.com/imdb',
            snippet: 'Fallback packet',
            retrievedAt: new Date('2026-03-04T00:00:00.000Z'),
          },
        ]),
      },
      externalReadingCuration: {
        findMany: vi.fn().mockRejectedValue(new Error('simulated external error')),
      },
      retrievalRun: {
        create: retrievalRunCreate,
      },
    } as const;

    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    const result = await retriever.getEvidenceForMovie('movie_2', {
      seasonSlug: 'season-2',
      packId: 'pack_cult',
      query: 'cult reception',
      topK: 3,
    });

    expect(result).toHaveLength(1);
    expect(retrievalRunCreate).toHaveBeenCalledTimes(1);
    expect(retrievalRunCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        movieId: 'movie_2',
        mode: 'hybrid',
        fallbackUsed: true,
        fallbackReason: 'hybrid-error',
        selectedCount: 1,
        seasonSlug: 'season-2',
        packId: 'pack_cult',
        duplicateRate: 0,
        citationValidRate: 1,
      }),
    }));
  });

  it('records duplicateRate when corpus has duplicate evidence entries', async () => {
    process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
    const retrievalRunCreate = vi.fn().mockResolvedValue({ id: 'run_3' });
    const prisma = {
      evidencePacket: {
        findMany: vi.fn().mockResolvedValue([
          {
            sourceName: 'Wikipedia',
            url: 'https://example.com/wiki',
            snippet: 'Duplicate snippet',
            retrievedAt: new Date('2026-03-04T00:00:00.000Z'),
          },
        ]),
      },
      externalReadingCuration: {
        findMany: vi.fn().mockResolvedValue([
          {
            sourceName: 'Wikipedia',
            url: 'https://example.com/wiki',
            articleTitle: 'Duplicate snippet',
            publicationDate: new Date('2026-03-04T00:00:00.000Z'),
            createdAt: new Date('2026-03-04T00:00:00.000Z'),
          },
        ]),
      },
      evidenceChunk: { findMany: vi.fn().mockResolvedValue([]) },
      retrievalRun: { create: retrievalRunCreate },
    } as const;

    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    await retriever.getEvidenceForMovie('movie_3', {
      seasonSlug: 'season-2',
      query: 'duplicate',
      topK: 5,
    });

    expect(retrievalRunCreate).toHaveBeenCalledTimes(1);
    expect(retrievalRunCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        duplicateRate: 0.5,
        citationValidRate: 1,
      }),
    }));
  });
});
