import { describe, expect, it } from 'vitest';
import { loadSeasonIntegrityRegistry, readAuthoritySnapshot } from '@/lib/audit/season-integrity-registry';

describe('season integrity registry', () => {
  it('loads configured seasons', async () => {
    const specs = await loadSeasonIntegrityRegistry();
    expect(specs.length).toBeGreaterThanOrEqual(2);
    expect(specs.some((spec) => spec.seasonSlug === 'season-1' && spec.packSlug === 'horror')).toBe(true);
    expect(specs.some((spec) => spec.seasonSlug === 'season-2' && spec.packSlug === 'cult-classics')).toBe(true);
  });

  it('parses authority snapshots for each configured season', async () => {
    const specs = await loadSeasonIntegrityRegistry();
    for (const spec of specs) {
      // eslint-disable-next-line no-await-in-loop
      const entries = await readAuthoritySnapshot(spec);
      expect(Array.isArray(entries)).toBe(true);
      for (const entry of entries.slice(0, 5)) {
        expect(entry.seasonSlug).toBe(spec.seasonSlug);
        expect(entry.packSlug).toBe(spec.packSlug);
        expect(typeof entry.nodeSlug).toBe('string');
        expect(typeof entry.tmdbId).toBe('number');
      }
    }
  });
});

