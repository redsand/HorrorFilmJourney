export function buildTmdbMovieDetailsUrl(input: {
  tmdbId: number;
  apiKey: string;
  language?: string;
  appendToResponse?: string;
}): URL {
  const { tmdbId, apiKey, language = 'en-US', appendToResponse = 'credits' } = input;
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', language);
  url.searchParams.set('append_to_response', appendToResponse);
  return url;
}

