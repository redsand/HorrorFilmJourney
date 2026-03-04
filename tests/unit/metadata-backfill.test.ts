import { describe, expect, it } from 'vitest';
import {
  buildSeason1MetadataUpdate,
  buildTmdbSeason1MetadataBackfillUrl,
  parseTmdbMetadataBackfill,
} from '@/lib/tmdb/metadata-backfill';

describe('metadata backfill contract', () => {
  it('builds TMDB request with credits and keywords append', () => {
    const url = buildTmdbSeason1MetadataBackfillUrl({
      tmdbId: 123,
      apiKey: 'test-key',
      language: 'en-US',
    });
    expect(url.pathname).toBe('/3/movie/123');
    expect(url.searchParams.get('append_to_response')).toBe('credits,keywords');
  });

  it('parses metadata payload and maps fields', () => {
    const parsed = parseTmdbMetadataBackfill({
      overview: 'A family moves into a haunted house.',
      runtime: 104,
      vote_count: 12345,
      vote_average: 7.1,
      popularity: 42.3,
      credits: {
        crew: [{ job: 'Director', name: 'Tobe Hooper' }],
        cast: [{ name: 'JoBeth Williams', character: 'Diane' }],
      },
      keywords: {
        keywords: [{ name: 'haunted house' }, { name: 'suburbia' }],
      },
    });
    expect(parsed.synopsis).toBe('A family moves into a haunted house.');
    expect(parsed.runtimeMinutes).toBe(104);
    expect(parsed.voteCount).toBe(12345);
    expect(parsed.voteAverage).toBe(7.1);
    expect(parsed.director).toBe('Tobe Hooper');
    expect(parsed.castTop[0]).toEqual({ name: 'JoBeth Williams', role: 'Diane' });
    expect(parsed.keywords).toEqual(['haunted house', 'suburbia']);
  });

  it('only populates missing fields and ratings', () => {
    const updates = buildSeason1MetadataUpdate({
      movieId: 'm1',
      existing: {
        synopsis: null,
        director: '',
        castTop: [],
        keywords: [],
        ratings: [],
      },
      parsed: {
        synopsis: 'Some overview',
        director: 'Director Name',
        castTop: [{ name: 'Actor', role: 'Lead' }],
        keywords: ['keyword-a'],
        runtimeMinutes: 101,
        voteAverage: 6.8,
        voteCount: 1000,
        popularity: 22.1,
      },
    });
    expect(updates.movieData.synopsis).toBe('Some overview');
    expect(updates.movieData.director).toBe('Director Name');
    expect(updates.movieData.castTop).toEqual([{ name: 'Actor', role: 'Lead' }]);
    expect(updates.movieData.keywords).toEqual(['keyword-a']);
    expect(updates.runtimeUpsert?.where.movieId_source.source).toBe('TMDB_RUNTIME');
    expect(updates.voteUpserts.map((row) => row.where.movieId_source.source).sort()).toEqual([
      'TMDB',
      'TMDB_POPULARITY',
      'TMDB_VOTE_COUNT',
    ]);
  });

  it('does not overwrite present metadata', () => {
    const updates = buildSeason1MetadataUpdate({
      movieId: 'm2',
      existing: {
        synopsis: 'Existing overview',
        director: 'Existing Director',
        castTop: [{ name: 'Existing Actor' }],
        keywords: ['already-set'],
        ratings: [
          { source: 'TMDB_RUNTIME', value: 110 },
          { source: 'TMDB', value: 7.4 },
          { source: 'TMDB_VOTE_COUNT', value: 2000 },
          { source: 'TMDB_POPULARITY', value: 80 },
        ],
      },
      parsed: {
        synopsis: 'Incoming overview',
        director: 'Incoming Director',
        castTop: [{ name: 'Incoming Actor', role: 'Lead' }],
        keywords: ['incoming-keyword'],
        runtimeMinutes: 95,
        voteAverage: 6.2,
        voteCount: 800,
        popularity: 10,
      },
    });
    expect(updates.movieData).toEqual({});
    expect(updates.runtimeUpsert).toBeNull();
    expect(updates.voteUpserts).toHaveLength(0);
  });
});
