import { describe, expect, it } from 'vitest';
import {
  buildTmdbCreditsBackfillUrl,
  parseTmdbCredits,
} from '@/lib/tmdb/credits-backfill';

describe('credits backfill contract', () => {
  it('builds TMDB details request with append_to_response=credits', () => {
    const url = buildTmdbCreditsBackfillUrl({
      tmdbId: 991,
      apiKey: 'test-key',
    });

    expect(url.pathname).toBe('/3/movie/991');
    expect(url.searchParams.get('api_key')).toBe('test-key');
    expect(url.searchParams.get('append_to_response')).toBe('credits');
  });

  it('maps director and castTop from credits payload', () => {
    const parsed = parseTmdbCredits({
      credits: {
        crew: [
          { job: 'Producer', name: 'Someone Else' },
          { job: 'Director', name: 'John Carpenter' },
        ],
        cast: [
          { name: 'Kurt Russell', character: 'R.J. MacReady' },
          { name: 'Keith David', character: 'Childs' },
          { name: 'Wilford Brimley' },
        ],
      },
    });

    expect(parsed.director).toBe('John Carpenter');
    expect(parsed.castTop).toEqual([
      { name: 'Kurt Russell', role: 'R.J. MacReady' },
      { name: 'Keith David', role: 'Childs' },
      { name: 'Wilford Brimley', role: 'Unknown' },
    ]);
  });
});

