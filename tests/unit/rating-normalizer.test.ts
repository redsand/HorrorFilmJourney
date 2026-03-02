import { describe, expect, it } from 'vitest';
import { normalizeRating } from '@/lib/ratings/rating-normalizer';

describe('normalizeRating', () => {
  it('normalizes imdb', () => {
    expect(normalizeRating('imdb', '7.8/10')).toEqual({ value: 7.8, scale: '10' });
  });

  it('normalizes rotten tomatoes', () => {
    expect(normalizeRating('rotten_tomatoes', '92%')).toEqual({ value: 92, scale: '100' });
  });

  it('normalizes metacritic', () => {
    expect(normalizeRating('metacritic', '81/100')).toEqual({ value: 81, scale: '100' });
  });

  it('rejects invalid input', () => {
    expect(() => normalizeRating('imdb', 'oops')).toThrow();
  });
});
