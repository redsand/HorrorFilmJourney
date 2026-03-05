import { createHash } from 'node:crypto';

export type EvidenceIngestDocumentInput = {
  movieId: string;
  seasonSlug?: string;
  sourceName: string;
  url: string;
  title: string;
  content: string;
  publishedAt?: string;
  license?: string;
};

export type EvidenceChunkingOptions = {
  maxChars?: number;
  overlapChars?: number;
};

export type ChunkedEvidenceDocument = {
  documentHash: string;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    text: string;
    charCount: number;
  }>;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function resolveOptions(input?: EvidenceChunkingOptions): Required<EvidenceChunkingOptions> {
  const maxChars = Number.isInteger(input?.maxChars) && (input?.maxChars ?? 0) >= 120
    ? Math.min(input!.maxChars!, 4000)
    : 700;
  const overlapChars = Number.isInteger(input?.overlapChars) && (input?.overlapChars ?? -1) >= 0
    ? Math.min(input!.overlapChars!, Math.floor(maxChars / 2))
    : 120;
  return { maxChars, overlapChars };
}

export function computeEvidenceChunkId(input: {
  sourceName: string;
  url: string;
  chunkIndex: number;
  chunkText: string;
}): string {
  return sha256(
    [
      input.sourceName.trim().toLowerCase(),
      input.url.trim().toLowerCase(),
      String(input.chunkIndex),
      normalizeWhitespace(input.chunkText),
    ].join('::'),
  );
}

export function computeEvidenceDocumentHash(input: {
  sourceName: string;
  url: string;
  title: string;
  content: string;
}): string {
  return sha256(
    [
      input.sourceName.trim().toLowerCase(),
      input.url.trim().toLowerCase(),
      normalizeWhitespace(input.title),
      normalizeWhitespace(input.content),
    ].join('::'),
  );
}

export function chunkEvidenceDocument(
  input: EvidenceIngestDocumentInput,
  options?: EvidenceChunkingOptions,
): ChunkedEvidenceDocument {
  const cfg = resolveOptions(options);
  const text = normalizeWhitespace(input.content);
  const chunks: ChunkedEvidenceDocument['chunks'] = [];

  if (text.length === 0) {
    return {
      documentHash: computeEvidenceDocumentHash(input),
      chunks: [],
    };
  }

  let offset = 0;
  let chunkIndex = 0;
  while (offset < text.length) {
    const maxEnd = Math.min(text.length, offset + cfg.maxChars);
    let end = maxEnd;
    if (maxEnd < text.length) {
      const lastSpace = text.lastIndexOf(' ', maxEnd);
      if (lastSpace > offset + Math.floor(cfg.maxChars * 0.6)) {
        end = lastSpace;
      }
    }
    const chunkText = normalizeWhitespace(text.slice(offset, end));
    if (chunkText.length > 0) {
      chunks.push({
        id: computeEvidenceChunkId({
          sourceName: input.sourceName,
          url: input.url,
          chunkIndex,
          chunkText,
        }),
        chunkIndex,
        text: chunkText,
        charCount: chunkText.length,
      });
      chunkIndex += 1;
    }
    if (end >= text.length) {
      break;
    }
    offset = Math.max(0, end - cfg.overlapChars);
  }

  return {
    documentHash: computeEvidenceDocumentHash(input),
    chunks,
  };
}

