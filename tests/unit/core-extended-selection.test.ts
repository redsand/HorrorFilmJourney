import { describe, expect, it } from 'vitest';
import { selectCoreAndExtendedAssignments, type TieredCandidate } from '@/lib/nodes/governance/core-extended-selection';

describe('core/extended tier selection', () => {
  it('keeps all quality candidates as extended and only top target in core', () => {
    const candidates: TieredCandidate[] = Array.from({ length: 200 }, (_, idx) => ({
      nodeSlug: 'cosmic-horror',
      movieId: `m-${idx + 1}`,
      finalScore: 0.95 - (idx * 0.001),
      journeyScore: 0.8 - (idx * 0.001),
    }));

    const selected = selectCoreAndExtendedAssignments({
      candidates,
      targetSizeByNode: { 'cosmic-horror': 120 },
      coreThresholdByNode: { 'cosmic-horror': 0.78 },
      maxNodesPerMovie: 3,
      disallowedPairs: [],
    });

    expect(selected.extendedByNode['cosmic-horror']).toHaveLength(200);
    expect(selected.coreByNode['cosmic-horror']).toHaveLength(120);
    expect(selected.coreByNode['cosmic-horror']![0]).toBe('m-1');
    expect(selected.coreByNode['cosmic-horror']![119]).toBe('m-120');
  });

  it('keeps curated anchors in core', () => {
    const candidates: TieredCandidate[] = [
      { nodeSlug: 'horror-comedy', movieId: 'curated-1', finalScore: 0.55, journeyScore: 0.6, isCurated: true },
      { nodeSlug: 'horror-comedy', movieId: 'candidate-1', finalScore: 0.9, journeyScore: 0.9 },
      { nodeSlug: 'horror-comedy', movieId: 'candidate-2', finalScore: 0.89, journeyScore: 0.85 },
    ];
    const selected = selectCoreAndExtendedAssignments({
      candidates,
      targetSizeByNode: { 'horror-comedy': 2 },
      coreThresholdByNode: { 'horror-comedy': 0.78 },
      maxNodesPerMovie: 3,
      disallowedPairs: [],
    });
    expect(selected.coreByNode['horror-comedy']).toContain('curated-1');
  });

  it('keeps relaxed-pass titles as extended-only when strict core journey gate fails', () => {
    const candidates: TieredCandidate[] = [
      { nodeSlug: 'folk-horror', movieId: 'm-core', finalScore: 0.9, journeyScore: 0.72 },
      { nodeSlug: 'folk-horror', movieId: 'm-extended-only', finalScore: 0.89, journeyScore: 0.55 },
    ];
    const selected = selectCoreAndExtendedAssignments({
      candidates,
      targetSizeByNode: { 'folk-horror': 2 },
      coreThresholdByNode: { 'folk-horror': 0.78 },
      maxNodesPerMovie: 3,
      disallowedPairs: [],
      journeyMinCore: 0.6,
      journeyMinExtended: 0.5,
    });

    expect(selected.extendedByNode['folk-horror']).toEqual(['m-core', 'm-extended-only']);
    expect(selected.coreByNode['folk-horror']).toEqual(['m-core']);
  });

  it('keeps core selection unchanged when journeyMinCore is unchanged', () => {
    const candidates: TieredCandidate[] = [
      { nodeSlug: 'survival-horror', movieId: 'a', finalScore: 0.91, journeyScore: 0.75 },
      { nodeSlug: 'survival-horror', movieId: 'b', finalScore: 0.9, journeyScore: 0.64 },
      { nodeSlug: 'survival-horror', movieId: 'c', finalScore: 0.89, journeyScore: 0.55 },
    ];

    const withExtended50 = selectCoreAndExtendedAssignments({
      candidates,
      targetSizeByNode: { 'survival-horror': 3 },
      coreThresholdByNode: { 'survival-horror': 0.78 },
      maxNodesPerMovie: 3,
      disallowedPairs: [],
      journeyMinCore: 0.6,
      journeyMinExtended: 0.5,
    });
    const withExtended40 = selectCoreAndExtendedAssignments({
      candidates,
      targetSizeByNode: { 'survival-horror': 3 },
      coreThresholdByNode: { 'survival-horror': 0.78 },
      maxNodesPerMovie: 3,
      disallowedPairs: [],
      journeyMinCore: 0.6,
      journeyMinExtended: 0.4,
    });

    expect(withExtended50.coreByNode['survival-horror']).toEqual(withExtended40.coreByNode['survival-horror']);
    expect(withExtended40.extendedByNode['survival-horror']).toContain('c');
  });

  it('allows scarce node relaxation only when prototype similarity is high', () => {
    const candidates: TieredCandidate[] = [
      { nodeSlug: 'experimental-horror', movieId: 'a', finalScore: 0.76, prototypeScore: 0.9, journeyScore: 0.8 },
      { nodeSlug: 'experimental-horror', movieId: 'b', finalScore: 0.75, prototypeScore: 0.88, journeyScore: 0.78 },
      { nodeSlug: 'experimental-horror', movieId: 'c', finalScore: 0.70, prototypeScore: 0.91, journeyScore: 0.77 },
      { nodeSlug: 'experimental-horror', movieId: 'd', finalScore: 0.70, prototypeScore: 0.5, journeyScore: 0.76 },
    ];

    const selected = selectCoreAndExtendedAssignments({
      candidates,
      targetSizeByNode: { 'experimental-horror': 3 },
      coreThresholdByNode: { 'experimental-horror': 0.72 },
      coreMinScoreAbsoluteByNode: { 'experimental-horror': 0.72 },
      corePickPercentileByNode: { 'experimental-horror': 0.3 },
      coreMaxPerNodeByNode: { 'experimental-horror': 3 },
      relaxationDelta: 0.03,
      relaxationPrototypeMin: 0.72,
      maxNodesPerMovie: 3,
      disallowedPairs: [],
      journeyMinCore: 0.6,
      journeyMinExtended: 0.5,
    });

    expect(selected.coreByNode['experimental-horror']).toEqual(['a', 'b', 'c']);
    expect(selected.coreMinScoreUsedByNode['experimental-horror']).toBe(0.7);
  });

  it('keeps abundant node strict with percentile + absolute floor', () => {
    const candidates: TieredCandidate[] = [
      { nodeSlug: 'supernatural-horror', movieId: 'a', finalScore: 0.95, prototypeScore: 0.8, journeyScore: 0.9 },
      { nodeSlug: 'supernatural-horror', movieId: 'b', finalScore: 0.91, prototypeScore: 0.8, journeyScore: 0.88 },
      { nodeSlug: 'supernatural-horror', movieId: 'c', finalScore: 0.89, prototypeScore: 0.8, journeyScore: 0.87 },
      { nodeSlug: 'supernatural-horror', movieId: 'd', finalScore: 0.88, prototypeScore: 0.8, journeyScore: 0.86 },
      { nodeSlug: 'supernatural-horror', movieId: 'e', finalScore: 0.87, prototypeScore: 0.95, journeyScore: 0.85 },
    ];

    const selected = selectCoreAndExtendedAssignments({
      candidates,
      targetSizeByNode: { 'supernatural-horror': 3 },
      coreThresholdByNode: { 'supernatural-horror': 0.72 },
      coreMinScoreAbsoluteByNode: { 'supernatural-horror': 0.72 },
      corePickPercentileByNode: { 'supernatural-horror': 0.3 },
      coreMaxPerNodeByNode: { 'supernatural-horror': 3 },
      maxNodesPerMovie: 3,
      disallowedPairs: [],
      journeyMinCore: 0.6,
      journeyMinExtended: 0.5,
    });

    expect(selected.coreByNode['supernatural-horror']).toEqual(['a', 'b', 'c']);
    expect(selected.coreMinScoreUsedByNode['supernatural-horror']).toBeGreaterThanOrEqual(0.89);
  });
});
