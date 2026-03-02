export type NormalizedRating = {
  value: number;
  scale: string;
};

const SUPPORTED_SOURCES = new Set(['IMDB', 'ROTTEN_TOMATOES', 'ROTTENTOMATOES', 'METACRITIC', 'TMDB']);

export function normalizeRating(source: string, rawValue: string): NormalizedRating {
  const normalizedSource = source.trim().toUpperCase().replace(/\s+/g, '_');
  if (!SUPPORTED_SOURCES.has(normalizedSource)) {
    throw new Error(`Unsupported rating source: ${source}`);
  }

  const value = rawValue.trim();

  if (normalizedSource === 'ROTTEN_TOMATOES' || normalizedSource === 'ROTTENTOMATOES') {
    const percentMatch = value.match(/^(\d+(?:\.\d+)?)%$/);
    if (!percentMatch) {
      throw new Error('Invalid Rotten Tomatoes rating');
    }
    return { value: Number(percentMatch[1]), scale: '100' };
  }

  if (normalizedSource === 'IMDB') {
    const match = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*10$/i);
    if (!match) {
      throw new Error('Invalid IMDb rating');
    }
    return { value: Number(match[1]), scale: '10' };
  }

  if (normalizedSource === 'METACRITIC') {
    const match = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*100$/i);
    if (!match) {
      throw new Error('Invalid Metacritic rating');
    }
    return { value: Number(match[1]), scale: '100' };
  }

  const tmdbMatch = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*10$/i);
  if (!tmdbMatch) {
    throw new Error('Invalid TMDB rating');
  }
  return { value: Number(tmdbMatch[1]), scale: '10' };
}
