import { describe, expect, it } from 'vitest';
import { buildRuntimeRatingUpsert, parseTmdbRuntimeMinutes } from '@/lib/tmdb/runtime-backfill';

describe('runtime backfill contract', () => {
  it('parses TMDB runtime and builds runtime rating upsert payload', () => {
    const runtime = parseTmdbRuntimeMinutes({ runtime: 102.4 });
    expect(runtime).toBe(102);

    const upsert = buildRuntimeRatingUpsert('movie_1', runtime!);
    expect(upsert.where.movieId_source).toEqual({ movieId: 'movie_1', source: 'TMDB_RUNTIME' });
    expect(upsert.create).toMatchObject({
      movieId: 'movie_1',
      source: 'TMDB_RUNTIME',
      value: 102,
      scale: 'MINUTES',
      rawValue: '102',
    });
    expect(upsert.update).toMatchObject({
      value: 102,
      scale: 'MINUTES',
      rawValue: '102',
    });
  });
});

