import { describe, expect, it } from 'vitest';
import { selectBalancedCandidates, type BalancedCandidate } from '@/lib/seasons/season3/calibration-balance';

function makeCandidate(tmdbId: number, strength: number, nodeSlug: string, probability = 0.9): BalancedCandidate {
  return {
    tmdbId,
    strength,
    topNodes: [
      { nodeSlug, probability, threshold: 0.5 },
    ],
  };
}

describe('season-3 calibration balance', () => {
  it('enforces per-node floor when enough node-affine candidates exist', () => {
    const candidates: BalancedCandidate[] = [
      makeCandidate(1, 0.99, 'a'),
      makeCandidate(2, 0.98, 'a'),
      makeCandidate(3, 0.97, 'a'),
      makeCandidate(4, 0.96, 'b'),
      makeCandidate(5, 0.95, 'b'),
      makeCandidate(6, 0.94, 'b'),
      makeCandidate(7, 0.93, 'c'),
      makeCandidate(8, 0.92, 'c'),
      makeCandidate(9, 0.91, 'c'),
    ];

    const selected = selectBalancedCandidates(candidates, {
      targetCount: 6,
      perNodeFloor: 2,
      nodeSlugs: ['a', 'b', 'c'],
    });

    expect(selected).toHaveLength(6);
    const countByNode = new Map<string, number>();
    for (const row of selected) {
      const nodeSlug = row.topNodes?.[0]?.nodeSlug ?? 'unknown';
      countByNode.set(nodeSlug, (countByNode.get(nodeSlug) ?? 0) + 1);
    }
    expect(countByNode.get('a')).toBeGreaterThanOrEqual(2);
    expect(countByNode.get('b')).toBeGreaterThanOrEqual(2);
    expect(countByNode.get('c')).toBeGreaterThanOrEqual(2);
  });

  it('fills remaining slots by strength after floor pass', () => {
    const candidates: BalancedCandidate[] = [
      makeCandidate(1, 0.99, 'a'),
      makeCandidate(2, 0.98, 'a'),
      makeCandidate(3, 0.97, 'a'),
      makeCandidate(4, 0.96, 'b'),
      makeCandidate(5, 0.95, 'b'),
      makeCandidate(6, 0.94, 'a'),
      makeCandidate(7, 0.93, 'a'),
    ];

    const selected = selectBalancedCandidates(candidates, {
      targetCount: 5,
      perNodeFloor: 2,
      nodeSlugs: ['a', 'b', 'c'],
    });

    expect(selected).toHaveLength(5);
    expect(selected.some((row) => row.tmdbId === 1)).toBe(true);
    expect(selected.some((row) => row.tmdbId === 2)).toBe(true);
  });
});
