import { describe, expect, it } from 'vitest';
import { getSeason1CandidatePool, type Season1AuditCandidateMovie } from '@/lib/audit/season1-candidate-pool';

function row(input: Partial<Season1AuditCandidateMovie> & Pick<Season1AuditCandidateMovie, 'id' | 'tmdbId' | 'title'>): Season1AuditCandidateMovie {
  return {
    id: input.id,
    tmdbId: input.tmdbId,
    title: input.title,
    year: input.year ?? null,
    genres: input.genres ?? [],
    keywords: input.keywords ?? [],
    metrics: {
      voteCount: input.metrics?.voteCount ?? 0,
      hybridScore: input.metrics?.hybridScore ?? 0,
      rating: input.metrics?.rating ?? 0,
      popularity: input.metrics?.popularity ?? 0,
      journeyScore: input.metrics?.journeyScore ?? 0,
    },
  };
}

describe('Season 1 candidate pool', () => {
  it('excludes non-horror catalog films from Season 1 toplist pool', () => {
    const input: Season1AuditCandidateMovie[] = [
      row({
        id: 'lotr',
        tmdbId: 120,
        title: 'The Lord of the Rings: The Fellowship of the Ring',
        genres: ['fantasy', 'adventure'],
        keywords: ['quest', 'ring'],
        metrics: { voteCount: 2_000_000, hybridScore: 0.98, rating: 8.8, popularity: 90, journeyScore: 0.9 },
      }),
      row({
        id: 'green-mile',
        tmdbId: 497,
        title: 'The Green Mile',
        genres: ['drama', 'crime'],
        keywords: ['prison', 'death row'],
        metrics: { voteCount: 1_500_000, hybridScore: 0.96, rating: 8.6, popularity: 88, journeyScore: 0.88 },
      }),
      row({
        id: 'halloween',
        tmdbId: 948,
        title: 'Halloween',
        genres: ['horror', 'thriller'],
        keywords: ['slasher'],
        metrics: { voteCount: 400_000, hybridScore: 0.82, rating: 7.7, popularity: 72, journeyScore: 0.79 },
      }),
    ];

    const pool = getSeason1CandidatePool(input);
    const ids = new Set(pool.map((item) => item.id));

    expect(ids.has('lotr')).toBe(false);
    expect(ids.has('green-mile')).toBe(false);
    expect(ids.has('halloween')).toBe(true);
  });

  it('is deterministic and ordered by tmdbId then id', () => {
    const input: Season1AuditCandidateMovie[] = [
      row({ id: 'b', tmdbId: 200, title: 'B', genres: ['horror'] }),
      row({ id: 'a', tmdbId: 200, title: 'A', genres: ['horror'] }),
      row({ id: 'c', tmdbId: 100, title: 'C', genres: ['horror'] }),
    ];

    const pool = getSeason1CandidatePool(input);
    expect(pool.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });
});
