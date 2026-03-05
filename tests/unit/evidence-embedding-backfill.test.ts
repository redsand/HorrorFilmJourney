import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_EVIDENCE_EMBEDDING_DIM,
  LOCAL_EVIDENCE_EMBEDDING_MODEL,
  backfillEvidenceChunkEmbeddings,
  computeEvidenceChunkEmbedding,
} from '@/lib/evidence/ingestion/embed';

describe('evidence chunk embedding backfill', () => {
  it('computes deterministic local embedding vector', () => {
    const a = computeEvidenceChunkEmbedding('midnight cult reception texture');
    const b = computeEvidenceChunkEmbedding('midnight cult reception texture');

    expect(a).toEqual(b);
    expect(a.length).toBe(LOCAL_EVIDENCE_EMBEDDING_DIM);
  });

  it('updates only missing embeddings by default', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'c1', text: 'chunk one', embeddingVector: null },
      { id: 'c2', text: 'chunk two', embeddingVector: [0.1, 0.2, 0.3, 0.4] },
    ]);
    const update = vi.fn().mockResolvedValue(null);
    const prisma = {
      evidenceChunk: {
        findMany,
        update,
      },
    } as const;

    const result = await backfillEvidenceChunkEmbeddings(prisma as never, { batchSize: 50 });
    expect(result.scanned).toBe(2);
    expect(result.updated).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' },
      data: expect.objectContaining({
        embeddingModel: LOCAL_EVIDENCE_EMBEDDING_MODEL,
        embeddingDim: LOCAL_EVIDENCE_EMBEDDING_DIM,
      }),
    }));
  });

  it('updates all rows when force=true', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'c1', text: 'chunk one', embeddingVector: null },
      { id: 'c2', text: 'chunk two', embeddingVector: [0.1, 0.2, 0.3, 0.4] },
    ]);
    const update = vi.fn().mockResolvedValue(null);
    const prisma = {
      evidenceChunk: {
        findMany,
        update,
      },
    } as const;

    const result = await backfillEvidenceChunkEmbeddings(prisma as never, {
      batchSize: 50,
      force: true,
    });
    expect(result.scanned).toBe(2);
    expect(result.updated).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
  });
});

