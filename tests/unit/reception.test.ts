import { describe, expect, it } from 'vitest';
import { computeReceptionCount } from '@/lib/movie/reception';

describe('computeReceptionCount', () => {
  it('counts distinct supported rating sources with non-null signal', () => {
    const count = computeReceptionCount([
      { source: 'IMDB', value: 7.7 },
      { source: 'TMDB', value: 7.1 },
      { source: 'METACRITIC', value: 74 },
      { source: 'ROTTEN_TOMATOES', rawValue: '88%' },
      { source: 'TMDB_POPULARITY', value: 55 }, // excluded
      { source: 'IMDB', value: 7.7 }, // duplicate source
    ]);
    expect(count).toBe(4);
  });

  it('returns zero for missing/unsupported entries', () => {
    const count = computeReceptionCount([
      { source: 'TMDB_RUNTIME', value: 102 },
      { source: 'IMDB', value: 0 },
      { source: 'ROTTEN_TOMATOES', rawValue: '' },
    ]);
    expect(count).toBe(0);
  });
});

