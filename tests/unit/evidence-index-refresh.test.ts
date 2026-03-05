import { describe, expect, it, vi } from 'vitest';
import { refreshEvidenceIndex } from '@/lib/evidence/ingestion';

describe('evidence index refresh', () => {
  it('iterates batches until all missing embeddings are backfilled', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'c1', text: 'a', embeddingVector: null },
        { id: 'c2', text: 'b', embeddingVector: null },
      ])
      .mockResolvedValueOnce([
        { id: 'c3', text: 'c', embeddingVector: null },
      ]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      evidenceChunk: {
        findMany,
        update,
      },
    } as const;

    const result = await refreshEvidenceIndex(prisma as never, { batchSize: 2, maxRounds: 10 });

    expect(result.complete).toBe(true);
    expect(result.rounds).toBe(2);
    expect(result.scanned).toBe(3);
    expect(result.updated).toBe(3);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('returns incomplete when maxRounds is hit', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'c1', text: 'a', embeddingVector: null },
      { id: 'c2', text: 'b', embeddingVector: null },
    ]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      evidenceChunk: {
        findMany,
        update,
      },
    } as const;

    const result = await refreshEvidenceIndex(prisma as never, { batchSize: 2, maxRounds: 2 });

    expect(result.complete).toBe(false);
    expect(result.rounds).toBe(2);
    expect(result.scanned).toBe(4);
    expect(result.updated).toBe(4);
  });
});
