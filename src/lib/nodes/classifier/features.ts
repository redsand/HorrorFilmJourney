import type { ClassifierMovieInput } from './types.ts';

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTokens(value: string): string[] {
  return norm(value)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

export function extractFeatureTokens(movie: ClassifierMovieInput): string[] {
  const tokens: string[] = [];

  tokens.push(...splitTokens(movie.title).map((token) => `t:${token}`));

  if (typeof movie.synopsis === 'string' && movie.synopsis.trim().length > 0) {
    tokens.push(...splitTokens(movie.synopsis).map((token) => `s:${token}`));
  }

  for (const genre of movie.genres) {
    const g = norm(genre);
    if (g.length > 0) {
      tokens.push(`g:${g}`);
    }
  }

  for (const keyword of movie.keywords ?? []) {
    const k = norm(keyword);
    if (k.length > 0) {
      tokens.push(`k:${k}`);
    }
  }

  if (typeof movie.country === 'string' && movie.country.trim().length > 0) {
    tokens.push(`c:${norm(movie.country)}`);
  }

  if (typeof movie.director === 'string' && movie.director.trim().length > 0) {
    tokens.push(`d:${norm(movie.director)}`);
  }

  for (const castName of (movie.cast ?? []).slice(0, 5)) {
    const c = norm(castName);
    if (c.length > 0) {
      tokens.push(`cast:${c}`);
    }
  }

  if (typeof movie.year === 'number' && Number.isFinite(movie.year)) {
    tokens.push(`year:${movie.year}`);
    const decade = Math.floor(movie.year / 10) * 10;
    tokens.push(`decade:${decade}`);
  }

  return tokens;
}

export function buildVocabulary(movies: ClassifierMovieInput[], maxTokens: number): string[] {
  const counts = new Map<string, number>();

  for (const movie of movies) {
    const unique = new Set(extractFeatureTokens(movie));
    for (const token of unique) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, Math.max(32, maxTokens))
    .map(([token]) => token);
}

export function vectorizeMovie(movie: ClassifierMovieInput, vocabulary: string[]): number[] {
  const vector = new Array<number>(vocabulary.length).fill(0);
  const index = new Map(vocabulary.map((token, idx) => [token, idx] as const));
  for (const token of extractFeatureTokens(movie)) {
    const idx = index.get(token);
    if (typeof idx === 'number') {
      vector[idx] += 1;
    }
  }
  return vector;
}

export function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function parseCastNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
        return ((entry as { name: string }).name).trim();
      }
      return '';
    })
    .filter((entry) => entry.length > 0)
    .slice(0, 8);
}
