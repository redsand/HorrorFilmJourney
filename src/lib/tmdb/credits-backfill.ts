import { buildTmdbMovieDetailsUrl } from './request-builders';
import { parseCastTop, parseDirector, type TmdbCredits } from './tmdb-normalization';

export type TmdbCreditsPayload = {
  credits?: TmdbCredits;
};

export function buildTmdbCreditsBackfillUrl(input: {
  tmdbId: number;
  apiKey: string;
  language?: string;
}): URL {
  return buildTmdbMovieDetailsUrl({
    tmdbId: input.tmdbId,
    apiKey: input.apiKey,
    language: input.language,
    appendToResponse: 'credits',
  });
}

export function parseTmdbCredits(payload: TmdbCreditsPayload, castLimit = 8): {
  director: string | null;
  castTop: Array<{ name: string; role: string }>;
} {
  return {
    director: parseDirector(payload.credits),
    castTop: parseCastTop(payload.credits, castLimit),
  };
}

