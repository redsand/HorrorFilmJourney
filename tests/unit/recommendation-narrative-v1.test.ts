import { describe, expect, it } from 'vitest';
import { buildNarrative, type CandidateMovie } from '@/lib/recommendation/recommendation-engine-v1';

function movieFixture(input: {
  tmdbId: number;
  title: string;
  year: number;
}): CandidateMovie {
  return {
    id: `m_${input.tmdbId}`,
    tmdbId: input.tmdbId,
    title: input.title,
    year: input.year,
    posterUrl: `https://image.tmdb.org/t/p/w500/${input.tmdbId}.jpg`,
    genres: ['horror', 'psychological'],
    ratings: {
      imdb: { value: 7.4, scale: '10', rawValue: '7.4/10' },
      additional: [
        { source: 'ROTTEN_TOMATOES', value: 81, scale: '100', rawValue: '81%' },
        { source: 'METACRITIC', value: 68, scale: '100', rawValue: '68/100' },
      ],
    },
  };
}

describe('buildNarrative', () => {
  it('produces movie-specific whatItTeaches text instead of a single generic line', () => {
    const first = buildNarrative(movieFixture({ tmdbId: 1001, title: 'First Film', year: 1981 }), 1);
    const second = buildNarrative(movieFixture({ tmdbId: 1002, title: 'Second Film', year: 2017 }), 2);

    expect(first.whatItTeaches).toContain('First Film');
    expect(second.whatItTeaches).toContain('Second Film');
    expect(first.whatItTeaches).not.toEqual(second.whatItTeaches);
  });
});

