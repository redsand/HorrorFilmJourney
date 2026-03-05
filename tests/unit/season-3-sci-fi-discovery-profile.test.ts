import { describe, expect, it } from 'vitest';
import {
  SCI_FI_PRIMARY_GENRES,
  SCI_FI_ADJACENT_GENRES,
  TMDB_GENRE,
  getSeason3SciFiDiscoverPlans,
} from '@/lib/seasons/season3/sci-fi-discovery-profile';

describe('season-3 sci-fi discovery profile', () => {
  it('includes science fiction as primary genre', () => {
    expect(SCI_FI_PRIMARY_GENRES).toContain(TMDB_GENRE.SCIENCE_FICTION);
  });

  it('covers key adjacent genres', () => {
    expect(SCI_FI_ADJACENT_GENRES).toEqual(
      expect.arrayContaining([
        TMDB_GENRE.ACTION,
        TMDB_GENRE.ADVENTURE,
        TMDB_GENRE.FANTASY,
        TMDB_GENRE.HORROR,
        TMDB_GENRE.MYSTERY,
        TMDB_GENRE.THRILLER,
        TMDB_GENRE.DRAMA,
      ]),
    );
  });

  it('defines multiple discover plans for breadth', () => {
    const plans = getSeason3SciFiDiscoverPlans();
    expect(plans.length).toBeGreaterThanOrEqual(5);
    expect(plans.some((plan) => plan.withGenres.includes(TMDB_GENRE.SCIENCE_FICTION))).toBe(true);
  });
});

