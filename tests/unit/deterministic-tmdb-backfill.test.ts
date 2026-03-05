import { describe, expect, it } from 'vitest';
import { buildCatalogIndex, resolveTmdbId } from '@/lib/audit/snapshot-divergence';
import { getDeterministicCatalogBackfill, listDeterministicCatalogBackfills } from '@/lib/catalog/deterministic-tmdb-backfill';

describe('deterministic tmdb backfill', () => {
  it('contains explicit backfill for Naked Blood tmdbId 778000', () => {
    const seeded = getDeterministicCatalogBackfill(778000);
    expect(seeded).not.toBeNull();
    expect(seeded?.title).toBe('Naked Blood');
  });

  it('resolves a known tmdbId hint even when title normalization differs', () => {
    const catalog = buildCatalogIndex(
      listDeterministicCatalogBackfills().map((movie) => ({
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year,
      })),
    );

    const resolved = resolveTmdbId('splatter naked blood ???', 1996, 778000, catalog);
    expect(resolved).toBe(778000);
  });
});
