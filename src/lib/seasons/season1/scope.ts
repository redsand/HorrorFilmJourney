export type Season1ScopeMovie = {
  genres?: string[] | null;
  keywords?: string[] | null;
  isCuratedAnchor?: boolean;
  maxNodeScore?: number | null;
  scopeNodeMin?: number;
  mediaType?: string | null;
};

const DEFAULT_SCOPE_NODE_MIN = 0.7;

const HARD_NEGATIVE_MEDIA_TYPES = new Set([
  'documentary',
  'tv',
  'tv_movie',
  'short',
]);

const FAMILY_FANTASY_BUCKET = new Set([
  'family',
  'animation',
  'fantasy',
  'adventure',
]);

const HORROR_KEYWORD_HINTS = [
  'horror',
  'haunt',
  'ghost',
  'demon',
  'devil',
  'occult',
  'zombie',
  'slasher',
  'monster',
  'supernatural',
  'vampire',
  'werewolf',
  'possession',
  'serial killer',
];

function normalize(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function hasHorrorGenre(genres: string[]): boolean {
  return genres.some((genre) => genre === 'horror' || genre.includes('horror'));
}

function hasHorrorKeyword(keywords: string[]): boolean {
  return keywords.some((keyword) => HORROR_KEYWORD_HINTS.some((hint) => keyword.includes(hint)));
}

function isHardNegative(input: { genres: string[]; keywords: string[]; mediaType: string | null }): string[] {
  const reasons: string[] = [];
  if (input.mediaType && HARD_NEGATIVE_MEDIA_TYPES.has(input.mediaType)) {
    reasons.push(`hard_negative_media_type:${input.mediaType}`);
  }

  const nonHorrorGenreSet = new Set(input.genres);
  const hasOnlyFamilyFantasyLike = nonHorrorGenreSet.size > 0
    && [...nonHorrorGenreSet].every((genre) => FAMILY_FANTASY_BUCKET.has(genre));
  if (hasOnlyFamilyFantasyLike && !hasHorrorKeyword(input.keywords)) {
    reasons.push('hard_negative_family_animation_fantasy_without_horror_keywords');
  }
  return reasons;
}

export function scopeReasons(movie: Season1ScopeMovie): string[] {
  const genres = normalize(movie.genres);
  const keywords = normalize(movie.keywords);
  const mediaType = movie.mediaType ? movie.mediaType.trim().toLowerCase() : null;
  const scopeNodeMin = Number.isFinite(movie.scopeNodeMin) ? (movie.scopeNodeMin as number) : DEFAULT_SCOPE_NODE_MIN;

  const reasons: string[] = [];
  if (movie.isCuratedAnchor) {
    reasons.push('curated_anchor_or_must_include');
    return reasons;
  }

  const hardNegatives = isHardNegative({ genres, keywords, mediaType });
  if (hardNegatives.length > 0) {
    reasons.push(...hardNegatives);
    return reasons;
  }

  if (hasHorrorGenre(genres)) {
    reasons.push('genre:horror');
    return reasons;
  }
  if (Number.isFinite(movie.maxNodeScore) && (movie.maxNodeScore as number) >= scopeNodeMin) {
    reasons.push(`strong_ontology_alignment:maxNodeScore>=${scopeNodeMin.toFixed(2)}`);
    return reasons;
  }

  reasons.push('out_of_scope:no_horror_genre_no_curated_anchor_no_strong_alignment');
  return reasons;
}

export function isSeason1HorrorScope(movie: Season1ScopeMovie): boolean {
  const reasons = scopeReasons(movie);
  return !reasons.some((reason) => reason.startsWith('hard_negative'))
    && !reasons.some((reason) => reason.startsWith('out_of_scope'));
}
