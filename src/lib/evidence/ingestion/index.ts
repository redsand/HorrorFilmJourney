import { chunkEvidenceDocument, type EvidenceIngestDocumentInput } from './chunking';

type PrismaEvidenceIngestionClient = {
  evidenceDocument: {
    upsert: (args: {
      where: { sourceName_url: { sourceName: string; url: string } };
      create: {
        movieId: string;
        seasonSlug?: string | null;
        sourceName: string;
        url: string;
        title: string;
        content: string;
        contentHash: string;
        publishedAt?: Date | null;
        license?: string | null;
      };
      update: {
        movieId: string;
        seasonSlug?: string | null;
        title: string;
        content: string;
        contentHash: string;
        publishedAt?: Date | null;
        license?: string | null;
      };
    }) => Promise<{ id: string }>;
  };
  evidenceChunk: {
    deleteMany: (args: { where: { documentId: string } }) => Promise<{ count: number }>;
    createMany: (args: {
      data: Array<{
        id: string;
        documentId: string;
        chunkIndex: number;
        text: string;
        charCount: number;
      }>;
    }) => Promise<{ count: number }>;
  };
};

export async function ingestEvidenceDocuments(
  prisma: PrismaEvidenceIngestionClient,
  documents: EvidenceIngestDocumentInput[],
): Promise<{ documentsProcessed: number; chunksWritten: number }> {
  let chunksWritten = 0;

  for (const document of documents) {
    const chunked = chunkEvidenceDocument(document);
    const upserted = await prisma.evidenceDocument.upsert({
      where: {
        sourceName_url: {
          sourceName: document.sourceName,
          url: document.url,
        },
      },
      create: {
        movieId: document.movieId,
        ...(document.seasonSlug ? { seasonSlug: document.seasonSlug } : {}),
        sourceName: document.sourceName,
        url: document.url,
        title: document.title,
        content: document.content,
        contentHash: chunked.documentHash,
        ...(document.publishedAt ? { publishedAt: new Date(document.publishedAt) } : {}),
        ...(document.license ? { license: document.license } : {}),
      },
      update: {
        movieId: document.movieId,
        ...(document.seasonSlug ? { seasonSlug: document.seasonSlug } : {}),
        title: document.title,
        content: document.content,
        contentHash: chunked.documentHash,
        ...(document.publishedAt ? { publishedAt: new Date(document.publishedAt) } : {}),
        ...(document.license ? { license: document.license } : {}),
      },
    });

    await prisma.evidenceChunk.deleteMany({
      where: { documentId: upserted.id },
    });

    if (chunked.chunks.length > 0) {
      await prisma.evidenceChunk.createMany({
        data: chunked.chunks.map((chunk) => ({
          id: chunk.id,
          documentId: upserted.id,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          charCount: chunk.charCount,
        })),
      });
      chunksWritten += chunked.chunks.length;
    }
  }

  return {
    documentsProcessed: documents.length,
    chunksWritten,
  };
}

export type { EvidenceIngestDocumentInput } from './chunking';
export {
  LOCAL_EVIDENCE_EMBEDDING_DIM,
  LOCAL_EVIDENCE_EMBEDDING_MODEL,
  backfillEvidenceChunkEmbeddings,
  computeEvidenceChunkEmbedding,
} from './embed';
