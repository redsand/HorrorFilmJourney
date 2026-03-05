import { computeLocalTextEmbedding, LOCAL_MOVIE_EMBEDDING_DIM } from '../../movie/local-embedding.ts';

export const LOCAL_EVIDENCE_EMBEDDING_MODEL = 'local-evidence-embedding-v1';
export const LOCAL_EVIDENCE_EMBEDDING_DIM = LOCAL_MOVIE_EMBEDDING_DIM;

type PrismaEvidenceEmbeddingClient = {
  evidenceChunk: {
    findMany: (args: {
      where?: { OR?: Array<{ embeddingVector: { equals: null } } | { embeddingModel: null } | { embeddingDim: null }> };
      orderBy: { createdAt: 'asc' };
      take: number;
      select: {
        id: true;
        text: true;
        embeddingVector: true;
      };
    }) => Promise<Array<{ id: string; text: string; embeddingVector: unknown }>>;
    update: (args: {
      where: { id: string };
      data: {
        embeddingModel: string;
        embeddingDim: number;
        embeddingVector: number[];
      };
    }) => Promise<unknown>;
  };
};

export function computeEvidenceChunkEmbedding(text: string): number[] {
  return computeLocalTextEmbedding(text, LOCAL_EVIDENCE_EMBEDDING_DIM);
}

export async function backfillEvidenceChunkEmbeddings(
  prisma: PrismaEvidenceEmbeddingClient,
  options?: { batchSize?: number; force?: boolean },
): Promise<{ scanned: number; updated: number }> {
  const batchSize = Number.isInteger(options?.batchSize) && (options?.batchSize ?? 0) > 0
    ? Math.min(options!.batchSize!, 5000)
    : 500;
  const force = options?.force === true;

  const chunks = await prisma.evidenceChunk.findMany({
    ...(force
      ? {}
      : {
    where: {
      OR: [
        { embeddingVector: { equals: null } },
        { embeddingModel: null },
        { embeddingDim: null },
      ],
    },
      }),
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    select: {
      id: true,
      text: true,
      embeddingVector: true,
    },
  });

  let updated = 0;
  for (const chunk of chunks) {
    if (!force && Array.isArray(chunk.embeddingVector) && chunk.embeddingVector.length > 0) {
      continue;
    }
    const embedding = computeEvidenceChunkEmbedding(chunk.text);
    await prisma.evidenceChunk.update({
      where: { id: chunk.id },
      data: {
        embeddingModel: LOCAL_EVIDENCE_EMBEDDING_MODEL,
        embeddingDim: LOCAL_EVIDENCE_EMBEDDING_DIM,
        embeddingVector: embedding,
      },
    });
    updated += 1;
  }

  return {
    scanned: chunks.length,
    updated,
  };
}
