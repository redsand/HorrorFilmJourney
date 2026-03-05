import { describe, expect, it } from 'vitest';
import {
  SEASON3_DISCOVERY_SCORE_WEIGHT_BY_PLAN_KEY,
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

  it('weights adjacent sweep below core sci-fi plans for deterministic ranking', () => {
    expect(SEASON3_DISCOVERY_SCORE_WEIGHT_BY_PLAN_KEY['core-sci-fi-vote-count']).toBeGreaterThan(
      SEASON3_DISCOVERY_SCORE_WEIGHT_BY_PLAN_KEY['adjacent-genre-sweep'],
    );
    expect(SEASON3_DISCOVERY_SCORE_WEIGHT_BY_PLAN_KEY['core-sci-fi-popularity']).toBeGreaterThan(
      SEASON3_DISCOVERY_SCORE_WEIGHT_BY_PLAN_KEY['adjacent-genre-sweep'],
    );
  });

  it('keeps adjacent sweep recall mode constrained by stronger vote threshold', () => {
    const adjacentPlan = getSeason3SciFiDiscoverPlans().find((plan) => plan.key === 'adjacent-genre-sweep');
    expect(adjacentPlan).toBeDefined();
    expect(adjacentPlan?.sortBy).toBe('vote_count.desc');
    expect(adjacentPlan?.voteCountGte).toBeGreaterThanOrEqual(50);
  });
});
