import { describe, expect, it } from 'vitest';
import { buildTmdbMovieDetailsUrl } from '@/lib/tmdb/request-builders';

describe('tmdb request builder contract', () => {
  it('includes append_to_response=credits for credits backfill', () => {
    const url = buildTmdbMovieDetailsUrl({
      tmdbId: 12345,
      apiKey: 'test-key',
      appendToResponse: 'credits',
    });

    expect(url.pathname).toBe('/3/movie/12345');
    expect(url.searchParams.get('api_key')).toBe('test-key');
    expect(url.searchParams.get('append_to_response')).toBe('credits');
  });
});

