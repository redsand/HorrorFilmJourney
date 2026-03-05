import { describe, expect, it } from 'vitest';
import season1FallbackSpec from '../../docs/season/season-1-fallback-candidates.json';
import season2FallbackSpec from '../../docs/season/season-2-fallback-candidates.json';
import { loadFallbackTmdbIds } from '@/lib/recommendation/candidate-fallback';

describe('candidate fallback loader', () => {
  it('reads season 1 fallback IDs in documented order', async () => {
    const tmdbIds = await loadFallbackTmdbIds('season-1', 'horror');
    expect(tmdbIds.slice(0, 5)).toEqual(season1FallbackSpec.tmdbIds.slice(0, 5));
  });

  it('reads season 2 fallback IDs in documented order', async () => {
    const tmdbIds = await loadFallbackTmdbIds('season-2', 'cult-classics');
    expect(tmdbIds.slice(0, 5)).toEqual(season2FallbackSpec.tmdbIds.slice(0, 5));
  });
});
