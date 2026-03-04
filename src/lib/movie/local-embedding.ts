import { createHash } from 'node:crypto';

export const LOCAL_MOVIE_EMBEDDING_MODEL = 'local-movie-embedding-v1';
export const LOCAL_MOVIE_EMBEDDING_DIM = 4;

type MovieEmbeddingInput = {
  title: string;
  year?: number | null;
  synopsis?: string | null;
  genres?: string[];
  keywords?: string[];
  director?: string | null;
  castTop?: string[];
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hashTokenToBucket(token: string, dim: number): { bucket: number; sign: number; weight: number } {
  const digest = createHash('sha256').update(token).digest();
  const bucket = digest[0]! % dim;
  const sign = (digest[1]! % 2) === 0 ? 1 : -1;
  const weight = 1 + ((digest[2]! % 5) / 10);
  return { bucket, sign, weight };
}

function normalizeL2(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  if (norm <= 0) {
    return vector.map(() => 0);
  }
  const denom = Math.sqrt(norm);
  return vector.map((value) => value / denom);
}

export function computeLocalTextEmbedding(text: string, dim = LOCAL_MOVIE_EMBEDDING_DIM): number[] {
  const size = Number.isFinite(dim) && dim > 0 ? Math.floor(dim) : LOCAL_MOVIE_EMBEDDING_DIM;
  const vector = new Array<number>(size).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const { bucket, sign, weight } = hashTokenToBucket(token, size);
    vector[bucket] = (vector[bucket] ?? 0) + (sign * weight);
  }
  return normalizeL2(vector).map((entry) => Number(entry.toFixed(8)));
}

export function buildMovieEmbeddingText(input: MovieEmbeddingInput): string {
  const parts: string[] = [input.title];
  if (typeof input.year === 'number' && Number.isFinite(input.year)) {
    parts.push(String(input.year));
    parts.push(`decade-${Math.floor(input.year / 10) * 10}`);
  }
  if (typeof input.synopsis === 'string' && input.synopsis.trim().length > 0) {
    parts.push(input.synopsis);
  }
  for (const genre of input.genres ?? []) {
    parts.push(genre);
  }
  for (const keyword of input.keywords ?? []) {
    parts.push(keyword);
  }
  if (typeof input.director === 'string' && input.director.trim().length > 0) {
    parts.push(input.director);
  }
  for (const castName of (input.castTop ?? []).slice(0, 8)) {
    parts.push(castName);
  }
  return parts.join(' ');
}

export function computeLocalMovieEmbedding(input: MovieEmbeddingInput, dim = LOCAL_MOVIE_EMBEDDING_DIM): number[] {
  return computeLocalTextEmbedding(buildMovieEmbeddingText(input), dim);
}
