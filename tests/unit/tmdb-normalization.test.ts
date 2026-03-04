import { describe, expect, it } from 'vitest';
import {
  parseCastTop,
  parseDirector,
  TMDB_GENRE_NAME_BY_ID,
  TMDB_HORROR_GENRE_ID,
  toGenreNames,
} from '@/lib/tmdb/tmdb-normalization';

describe('tmdb normalization', () => {
  it('keeps horror genre id mapping intact', () => {
    expect(TMDB_HORROR_GENRE_ID).toBe(27);
    expect(TMDB_GENRE_NAME_BY_ID[TMDB_HORROR_GENRE_ID]).toBe('horror');
    expect(toGenreNames([27, 878])).toContain('horror');
    expect(toGenreNames([27, 878])).toContain('sci-fi-horror');
  });

  it('extracts director and cast safely from credits', () => {
    const credits = {
      crew: [
        { name: 'Jane Doe', job: 'Writer' },
        { name: 'John Carpenter', job: 'Director' },
      ],
      cast: [
        { name: 'Actor One', character: 'Lead' },
        { name: 'Actor Two', character: '' },
      ],
    };

    expect(parseDirector(credits)).toBe('John Carpenter');
    expect(parseCastTop(credits, 2)).toEqual([
      { name: 'Actor One', role: 'Lead' },
      { name: 'Actor Two', role: 'Unknown' },
    ]);
  });
});
