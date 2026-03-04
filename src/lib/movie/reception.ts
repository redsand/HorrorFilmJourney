export type ReceptionRating = {
  source: string;
  value?: number | null;
  rawValue?: string | null;
};

const RECEPTION_RATING_SOURCES = new Set([
  'IMDB',
  'TMDB',
  'ROTTEN_TOMATOES',
  'ROTTENTOMATOES',
  'METACRITIC',
  'TMDB_AUDIENCE_PROXY',
]);

function hasSignalValue(rating: ReceptionRating): boolean {
  if (typeof rating.value === 'number' && Number.isFinite(rating.value) && rating.value > 0) {
    return true;
  }
  if (typeof rating.rawValue === 'string' && rating.rawValue.trim().length > 0) {
    return true;
  }
  return false;
}

export function computeReceptionCount(ratings: ReceptionRating[] | null | undefined): number {
  if (!ratings || ratings.length === 0) {
    return 0;
  }
  const distinctSources = new Set<string>();
  for (const rating of ratings) {
    const source = rating.source.trim().toUpperCase();
    if (!RECEPTION_RATING_SOURCES.has(source)) {
      continue;
    }
    if (!hasSignalValue(rating)) {
      continue;
    }
    distinctSources.add(source);
  }
  return distinctSources.size;
}

