import { describe, expect, it } from 'vitest';
import {
  buildTmdbVoteBackfillUrl,
  buildVoteRatingUpserts,
  parseTmdbVoteMetrics,
} from '@/lib/tmdb/vote-backfill';

describe('vote backfill contract', () => {
  it('builds request url, parses vote payload, and builds persist upserts', () => {
    const url = buildTmdbVoteBackfillUrl({
      tmdbId: 991,
      apiKey: 'test-key',
    });
    expect(url.pathname).toBe('/3/movie/991');
    expect(url.searchParams.get('api_key')).toBe('test-key');
    expect(url.searchParams.get('language')).toBe('en-US');

    const metrics = parseTmdbVoteMetrics({
      vote_count: 12543.2,
      vote_average: 7.346,
      popularity: 52.8,
    });
    expect(metrics).toEqual({
      voteCount: 12543,
      voteAverage: 7.346,
      popularity: 52.8,
    });

    const upserts = buildVoteRatingUpserts({
      movieId: 'movie_1',
      metrics,
      includePopularity: true,
    });
    expect(upserts.map((entry) => entry.where.movieId_source.source).sort()).toEqual([
      'TMDB',
      'TMDB_POPULARITY',
      'TMDB_VOTE_COUNT',
    ]);
    const tmdbVote = upserts.find((entry) => entry.where.movieId_source.source === 'TMDB');
    expect(tmdbVote?.create.value).toBe(7.346);
    expect(tmdbVote?.create.scale).toBe('10');
    const tmdbVoteCount = upserts.find((entry) => entry.where.movieId_source.source === 'TMDB_VOTE_COUNT');
    expect(tmdbVoteCount?.create.value).toBe(12543);
    const popularity = upserts.find((entry) => entry.where.movieId_source.source === 'TMDB_POPULARITY');
    expect(popularity?.create.value).toBe(53);
    expect(popularity?.create.scale).toBe('100');
  });
});

