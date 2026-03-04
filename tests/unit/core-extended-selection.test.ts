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
});
