
  import { chunkEvidenceDocument, type EvidenceIngestDocumentInput } from './chunking';
  import { PrismaClient } from '@prisma/client';

  export async function ingestEvidenceDocuments(
    prisma: PrismaClient,
    documents: EvidenceIngestDocumentInput[],
  ): Promise<{ documentsProcessed: number; chunksWritten: number; skipped: number }> {
    let chunksWritten = 0;
    let skipped = 0;

    // Build TMDB ID to UUID map
    const tmdbToUuid = new Map<number, string>();
    const tmdbIds = new Set<number>();
    for (const doc of documents) {
      if (doc.movieId.startsWith('tmdb:')) {
        const id = parseInt(doc.movieId.slice(5), 10);
        if (!isNaN(id)) tmdbIds.add(id);
      }
    }
    if (tmdbIds.size > 0) {
      const movies = await prisma.movie.findMany({
        where: { tmdbId: { in: [...tmdbIds] } },
        select: { id: true, tmdbId: true }
      });
      for (const m of movies) tmdbToUuid.set(m.tmdbId, m.id);
    }

    for (const document of documents) {
      // Resolve tmdb:XXX to internal UUID
      let movieId = document.movieId;
      if (document.movieId.startsWith('tmdb:')) {
        const tmdbId = parseInt(document.movieId.slice(5), 10);
        const uuid = tmdbToUuid.get(tmdbId);
        if (!uuid) {
          console.log('  Skipping movie not found in DB:', document.movieId, '(' + document.title + ')');
          skipped++;
          continue;
        }
        movieId = uuid;
      }

      const seasonSlug = document.seasonSlug ?? null;
      if (!seasonSlug) {
        console.log('  Skipping document without seasonSlug:', document.sourceName, document.url);
        skipped++;
        continue;
      }
      const chunked = chunkEvidenceDocument(document);
      const upserted = await prisma.evidenceDocument.upsert({
        where: { sourceName_url_seasonSlug: { sourceName: document.sourceName, url: document.url, seasonSlug } },
        create: { movieId, seasonSlug, sourceName: document.sourceName, url: document.url, title: document.title, content: document.content, contentHash: chunked.documentHash, publishedAt:
  document.publishedAt ? new Date(document.publishedAt) : null, license: document.license },
        update: { movieId, title: document.title, content: document.content, contentHash: chunked.documentHash, publishedAt: document.publishedAt ? new
  Date(document.publishedAt) : null, license: document.license },
      });

      await prisma.evidenceChunk.deleteMany({ where: { documentId: upserted.id } });
      if (chunked.chunks.length > 0) {
        await prisma.evidenceChunk.createMany({ skipDuplicates: true, data: chunked.chunks.map(c => ({ id: c.id, documentId: upserted.id, chunkIndex: c.chunkIndex, text: c.text, charCount: c.charCount })) });
        chunksWritten += chunked.chunks.length;
      }
    }
    return { documentsProcessed: documents.length - skipped, chunksWritten, skipped };
  }

  export type { EvidenceIngestDocumentInput } from './chunking';
  export type { EvidenceIngestionCheckpoint } from './checkpoint';
  export { normalizeAndDedupeEvidenceDocuments, normalizeEvidenceDocumentInput } from './adapters';
  export { LOCAL_EVIDENCE_EMBEDDING_DIM, LOCAL_EVIDENCE_EMBEDDING_MODEL, backfillEvidenceChunkEmbeddings, computeEvidenceChunkEmbedding } from './embed';
  export { refreshEvidenceIndex } from './index-refresh';
  export { createEmptyEvidenceIngestionCheckpoint, filterPendingEvidenceDocuments, markEvidenceDocumentInCheckpoint } from './checkpoint';
