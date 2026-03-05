import type { EvidenceIngestDocumentInput } from './chunking';

type RawEvidenceDoc = Partial<EvidenceIngestDocumentInput> & {
  movieTmdbId?: number;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value: string): string {
  return value.trim();
}

export function normalizeEvidenceDocumentInput(
  input: RawEvidenceDoc,
): EvidenceIngestDocumentInput | null {
  const movieId = typeof input.movieId === 'string' ? input.movieId.trim() : '';
  const sourceName = typeof input.sourceName === 'string' ? normalizeText(input.sourceName) : '';
  const url = typeof input.url === 'string' ? normalizeUrl(input.url) : '';
  const title = typeof input.title === 'string' ? normalizeText(input.title) : '';
  const content = typeof input.content === 'string' ? normalizeText(input.content) : '';

  if (!movieId || !sourceName || !url || !title || !content) {
    return null;
  }

  return {
    movieId,
    ...(typeof input.seasonSlug === 'string' && input.seasonSlug.trim().length > 0
      ? { seasonSlug: input.seasonSlug.trim() }
      : {}),
    sourceName,
    url,
    title,
    content,
    ...(typeof input.publishedAt === 'string' && input.publishedAt.trim().length > 0
      ? { publishedAt: input.publishedAt.trim() }
      : {}),
    ...(typeof input.license === 'string' && input.license.trim().length > 0
      ? { license: input.license.trim() }
      : {}),
  };
}

function dedupeKey(input: EvidenceIngestDocumentInput): string {
  return [
    input.movieId.trim().toLowerCase(),
    input.sourceName.trim().toLowerCase(),
    input.url.trim().toLowerCase(),
    input.title.trim().toLowerCase(),
  ].join('|');
}

export function normalizeAndDedupeEvidenceDocuments(
  inputs: RawEvidenceDoc[],
): EvidenceIngestDocumentInput[] {
  const out: EvidenceIngestDocumentInput[] = [];
  const seen = new Set<string>();
  for (const item of inputs) {
    const normalized = normalizeEvidenceDocumentInput(item);
    if (!normalized) {
      continue;
    }
    const key = dedupeKey(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(normalized);
  }
  return out;
}
