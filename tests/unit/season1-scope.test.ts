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
    })).toBe(false);
  });

  it('excludes comedy-only mockumentary leakage even with high node score', () => {
    expect(isSeason1HorrorScope({
      genres: ['comedy'],
      keywords: ['mockumentary', 'satire'],
      maxNodeScore: 0.95,
    })).toBe(false);
  });

  it('handles object-shaped genre and keyword metadata deterministically', () => {
    expect(isSeason1HorrorScope({
      genres: [{ name: 'Comedy' }, { name: 'Family' }] as Array<{ name: string }>,
      keywords: [{ name: 'satire' }] as Array<{ name: string }>,
      maxNodeScore: 0.98,
    })).toBe(false);

    expect(isSeason1HorrorScope({
      genres: [{ name: 'Thriller' }, { name: 'Mystery' }] as Array<{ name: string }>,
      keywords: [{ name: 'haunted house' }] as Array<{ name: string }>,
      maxNodeScore: 0.9,
    })).toBe(true);
  });

  it('rejects high ontology score with no horror signals', () => {
    expect(isSeason1HorrorScope({
      genres: ['drama'],
      keywords: ['marriage', 'career', 'friendship'],
      maxNodeScore: 0.99,
      scopeNodeMin: 0.7,
    })).toBe(false);
  });

  it('does not allow curated anchors to bypass hard negatives', () => {
    expect(isSeason1HorrorScope({
      genres: ['comedy', 'family'],
      keywords: ['friendship', 'school'],
      isCuratedAnchor: true,
      maxNodeScore: 0.99,
    })).toBe(false);
  });
});
