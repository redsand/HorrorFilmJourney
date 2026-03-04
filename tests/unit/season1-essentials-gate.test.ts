import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatSeason1EssentialsGateFailure,
  recommendedFixForReason,
  toEssentialLookupKeys,
  type Season1EssentialFixtureEntry,
} from '@/lib/verification/season1-essentials-gate';

describe('season1 essentials gate helpers', () => {
  it('maps known exclusion reasons to actionable fix paths', () => {
    expect(recommendedFixForReason('missing_credits')).toBe('credits_backfill');
    expect(recommendedFixForReason('node_score_below_quality_floor')).toBe('add_or_refine_prototypes_and_targeted_lfs');
    expect(recommendedFixForReason('journey_gate_fail:missing_metadata')).toBe('metadata_backfill_then_rebuild');
  });

  it('builds deterministic title/year lookup keys including alt titles', () => {
    const keys = toEssentialLookupKeys({
      title: "Bram Stoker's Dracula",
      altTitle: 'Dracula',
      year: 1992,
    });
    expect(keys).toContain('bram stoker s dracula::1992');
    expect(keys).toContain('dracula::1992');
  });

  it('formats concise missing summary details', () => {
    const output = formatSeason1EssentialsGateFailure([
      {
        title: 'Get Out',
        year: 2017,
        reason: 'node_score_below_quality_floor',
        recommendedFix: 'add_or_refine_prototypes_and_targeted_lfs',
        details: [],
      },
    ]);
    expect(output).toContain('missing=1');
    expect(output).toContain('Get Out (2017)');
  });

  it('fixture contains 50-150 essentials', () => {
    const fixturePath = resolve('tests/fixtures/season1-essentials.json');
    const parsed = JSON.parse(readFileSync(fixturePath, 'utf8')) as Season1EssentialFixtureEntry[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(50);
    expect(parsed.length).toBeLessThanOrEqual(150);
  });
});
