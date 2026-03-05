import { describe, expect, it, vi } from 'vitest';
import { ingestEvidenceDocuments } from '@/lib/evidence/ingestion';

describe('evidence ingestion', () => {
  it('upserts document + chunks and is idempotent for same input', async () => {
    const documentUpsert = vi.fn().mockResolvedValue({
      id: 'doc_1',
      movieId: 'movie_1',
      sourceName: 'Criterion',
      url: 'https://criterion.com/essay/eraserhead',
    });
    const chunkDeleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const chunkCreateMany = vi.fn().mockResolvedValue({ count: 3 });

    const prisma = {
      evidenceDocument: { upsert: documentUpsert },
      evidenceChunk: {
        deleteMany: chunkDeleteMany,
        createMany: chunkCreateMany,
      },
    } as const;

    const payload = [{
      movieId: 'movie_1',
      seasonSlug: 'season-2',
      sourceName: 'Criterion',
      url: 'https://criterion.com/essay/eraserhead',
      title: 'Eraserhead and Midnight Cinema',
      content: 'Long-form source text for deterministic chunking and retrieval context.',
      publishedAt: '2026-03-01T00:00:00.000Z',
      license: 'editorial-link-only',
    }];

    const first = await ingestEvidenceDocuments(prisma as never, payload);
    const second = await ingestEvidenceDocuments(prisma as never, payload);

    expect(first.documentsProcessed).toBe(1);
    expect(second.documentsProcessed).toBe(1);
    expect(documentUpsert).toHaveBeenCalledTimes(2);
    expect(chunkDeleteMany).toHaveBeenCalledTimes(2);
    expect(chunkCreateMany).toHaveBeenCalledTimes(2);
    expect(chunkCreateMany.mock.calls[0]?.[0]).toEqual(chunkCreateMany.mock.calls[1]?.[0]);
  });
});

