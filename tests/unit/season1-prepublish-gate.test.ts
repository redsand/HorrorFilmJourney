import { describe, expect, it } from 'vitest';
import { evaluateSeason1PrepublishGate } from '@/lib/verification/season1-prepublish-gate';

describe('season1 prepublish gate', () => {
  it('fails when totals are too low without override', () => {
    const result = evaluateSeason1PrepublishGate({
      totalUniqueMovies: 294,
      extendedUniqueOnlyMovies: 5,
      eligiblePoolCount: 1000,
      journeyExtendedPassCount: 300,
    });
    expect(result.pass).toBe(false);
    expect(result.checks.find((row) => row.name.includes('totalUniqueMovies'))?.pass).toBe(false);
    expect(result.checks.find((row) => row.name.includes('extendedUniqueOnly'))?.pass).toBe(false);
    expect(result.checks.find((row) => row.name.includes('journey gate removals'))?.pass).toBe(false);
  });

  it('allows shrink only with explicit reason', () => {
    const noReason = evaluateSeason1PrepublishGate({
      totalUniqueMovies: 840,
      extendedUniqueOnlyMovies: 140,
      eligiblePoolCount: 1000,
      journeyExtendedPassCount: 500,
      allowShrink: true,
      allowShrinkReason: '',
    });
    expect(noReason.pass).toBe(false);

    const withReason = evaluateSeason1PrepublishGate({
      totalUniqueMovies: 840,
      extendedUniqueOnlyMovies: 140,
      eligiblePoolCount: 1000,
      journeyExtendedPassCount: 500,
      allowShrink: true,
      allowShrinkReason: 'manual curation lock while fixing ingestion regression',
    });
    expect(withReason.pass).toBe(true);
  });

  it('passes when all thresholds are met', () => {
    const result = evaluateSeason1PrepublishGate({
      totalUniqueMovies: 920,
      extendedUniqueOnlyMovies: 180,
      eligiblePoolCount: 1000,
      journeyExtendedPassCount: 450,
    });
    expect(result.pass).toBe(true);
    expect(result.checks.every((row) => row.pass)).toBe(true);
  });
});
