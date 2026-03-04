export const TMDB_HORROR_GENRE_ID = 27;

export const TMDB_GENRE_NAME_BY_ID: Record<number, string> = {
  27: 'horror',
  53: 'thriller',
  9648: 'mystery',
  14: 'fantasy',
  878: 'sci-fi',
  80: 'crime',
  18: 'drama',
  35: 'comedy',
  12: 'adventure',
  16: 'animation',
};

export type TmdbCreditPerson = {
  name?: string;
  job?: string;
  character?: string;
};

export type TmdbCredits = {
  cast?: TmdbCreditPerson[];
  crew?: TmdbCreditPerson[];
};

export type TmdbDetailsLike = {
  genre_ids?: number[];
  genres?: Array<{ id?: number; name?: string }>;
  keywords?: { keywords?: Array<{ name?: string }> };
  production_countries?: Array<{ name?: string }>;
  credits?: TmdbCredits;
};

export function toGenreIds(movie: TmdbDetailsLike): number[] {
  if (Array.isArray(movie.genre_ids) && movie.genre_ids.length > 0) {
    return movie.genre_ids.filter((id): id is number => Number.isInteger(id));
  }
  if (Array.isArray(movie.genres) && movie.genres.length > 0) {
    return movie.genres
      .map((genre) => genre.id)
      .filter((id): id is number => Number.isInteger(id));
  }
  return [];
}

export function toGenreNames(genreIds: number[]): string[] {
  const mapped = genreIds
    .map((id) => TMDB_GENRE_NAME_BY_ID[id])
    .filter((value): value is string => typeof value === 'string');
  const derived = new Set(mapped.length > 0 ? mapped : ['horror']);
  if (genreIds.includes(878)) {
    derived.add('sci-fi-horror');
  }
  return [...derived];
}

export function parseKeywords(details: TmdbDetailsLike | null): string[] {
  if (!details || !Array.isArray(details.keywords?.keywords)) {
    return [];
  }
  return details.keywords.keywords
    .map((item) => (typeof item?.name === 'string' ? item.name.trim().toLowerCase() : ''))
    .filter((value) => value.length > 0)
    .slice(0, 24);
}

export function parseCountry(details: TmdbDetailsLike | null): string | null {
  if (!details || !Array.isArray(details.production_countries)) {
    return null;
  }
  const first = details.production_countries.find((item) => typeof item?.name === 'string' && item.name.trim().length > 0);
  return first?.name?.trim() ?? null;
}

export function parseDirector(credits?: TmdbCredits): string | null {
  if (!credits || !Array.isArray(credits.crew)) {
    return null;
  }
  const director = credits.crew.find((item) => typeof item?.job === 'string' && item.job.toLowerCase() === 'director');
  if (!director || typeof director.name !== 'string') {
    return null;
  }
  const value = director.name.trim();
  return value.length > 0 ? value : null;
}

export function parseCastTop(credits?: TmdbCredits, limit = 8): Array<{ name: string; role: string }> {
  if (!credits || !Array.isArray(credits.cast)) {
    return [];
  }
  return credits.cast
    .map((entry) => {
      const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
      const role = typeof entry?.character === 'string' ? entry.character.trim() : '';
      if (!name) {
        return null;
      }
      return { name, role: role || 'Unknown' };
    })
    .filter((entry): entry is { name: string; role: string } => entry !== null)
    .slice(0, limit);
}
