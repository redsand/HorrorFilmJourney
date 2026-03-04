import { describe, expect, it } from 'vitest';
import { isSeason1HorrorScope, scopeReasons } from '@/lib/seasons/season1/scope';

describe('Season 1 scope predicate', () => {
  it('includes true horror by genre', () => {
    const inScope = isSeason1HorrorScope({
      genres: ['horror', 'thriller'],
      keywords: ['slasher', 'masked killer'],
      maxNodeScore: 0.1,
    });
    expect(inScope).toBe(true);
    expect(scopeReasons({ genres: ['horror'], keywords: [] })[0]).toBe('genre:horror');
  });

  it('includes horror-adjacent thriller only with strong ontology alignment', () => {
    expect(isSeason1HorrorScope({
      genres: ['thriller', 'mystery'],
      keywords: ['detective', 'crime'],
      maxNodeScore: 0.72,
      scopeNodeMin: 0.7,
    })).toBe(true);

    expect(isSeason1HorrorScope({
      genres: ['thriller', 'mystery'],
      keywords: ['detective', 'crime'],
      maxNodeScore: 0.55,
      scopeNodeMin: 0.7,
    })).toBe(false);
  });

  it('excludes clear non-horror unless curated', () => {
    expect(isSeason1HorrorScope({
      genres: ['fantasy', 'adventure'],
      keywords: ['quest', 'ring'],
      maxNodeScore: 0.2,
    })).toBe(false); // LOTR

    expect(isSeason1HorrorScope({
      genres: ['drama', 'crime'],
      keywords: ['prison', 'death row'],
      maxNodeScore: 0.3,
    })).toBe(false); // Green Mile

    expect(isSeason1HorrorScope({
      genres: ['animation', 'fantasy', 'family'],
      keywords: ['spirit', 'forest'],
      maxNodeScore: 0.9,
    })).toBe(false); // Princess Mononoke hard-negative family/animation/fantasy bucket

    expect(isSeason1HorrorScope({
      genres: ['fantasy', 'adventure'],
      keywords: ['quest', 'ring'],
      isCuratedAnchor: true,
      maxNodeScore: 0.1,
    })).toBe(true);
  });
});

