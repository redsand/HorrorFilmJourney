export type CurriculumMovieRating = { source: string };

export type CurriculumEligibilityInput = {
  posterUrl: string;
  director: string | null;
  castTop: unknown;
  ratings: CurriculumMovieRating[];
  hasStreamingData?: boolean;
};

export type CurriculumEligibilityResult = {
  isEligible: boolean;
  completenessTier: 'ENRICHED' | 'BASIC';
  missingPoster: boolean;
  missingRatings: boolean;
  missingReception: boolean;
  missingCredits: boolean;
  missingStreaming: boolean;
};

function parseCastTop(value: unknown): Array<{ name?: string; role?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is { name?: string; role?: string } => {
    return typeof entry === 'object' && entry !== null;
  });
}

export function evaluateCurriculumEligibility(input: CurriculumEligibilityInput): CurriculumEligibilityResult {
  const ratingSources = new Set(input.ratings.map((rating) => rating.source.toUpperCase()));
  const hasPoster = input.posterUrl.trim().length > 0;
  const hasImdb = ratingSources.has('IMDB');
  const hasAdditional = [...ratingSources].filter((source) => source !== 'IMDB').length >= 1;
  const hasReception =
    ratingSources.has('ROTTEN_TOMATOES')
    || ratingSources.has('METACRITIC')
    || ratingSources.has('TMDB')
    || ratingSources.has('TMDB_AUDIENCE_PROXY');
  const cast = parseCastTop(input.castTop);
  const hasCast = cast.some((entry) => typeof entry.name === 'string' && entry.name.trim().length > 0);
  const hasDirector = Boolean(input.director && input.director.trim().length > 0);
  const hasCredits = hasCast && hasDirector;
  const hasStreamingData = Boolean(input.hasStreamingData);

  const isEligible = hasPoster && hasImdb && hasAdditional && hasReception && hasCredits;

  return {
    isEligible,
    completenessTier: isEligible ? 'ENRICHED' : 'BASIC',
    missingPoster: !hasPoster,
    missingRatings: !(hasImdb && hasAdditional),
    missingReception: !hasReception,
    missingCredits: !hasCredits,
    missingStreaming: !hasStreamingData,
  };
}
