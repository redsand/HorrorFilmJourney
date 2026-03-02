import { createHash } from 'node:crypto';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildEvidenceDedupKey(input: {
  movieId: string;
  sourceName: string;
  url?: string;
  snippet: string;
}): string {
  const normalizedSource = input.sourceName.trim().toUpperCase();
  const normalizedUrl = input.url?.trim() ?? '';
  const snippetHash = sha256(input.snippet.trim());
  return sha256(`${input.movieId}::${normalizedSource}::${normalizedUrl}::${snippetHash}`);
}
