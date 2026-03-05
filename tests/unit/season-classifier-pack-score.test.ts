import { describe, expect, it } from 'vitest';
import { computeSeasonPackScore } from '@/lib/nodes/classifier';

describe('computeSeasonPackScore', () => {
  it('returns zero for empty probabilities', () => {
    expect(computeSeasonPackScore([])).toBe(0);
  });

  it('weights top score over average', () => {
    const score = computeSeasonPackScore([
      { nodeSlug: 'a', probability: 0.9, threshold: 0.5 },
      { nodeSlug: 'b', probability: 0.5, threshold: 0.5 },
      { nodeSlug: 'c', probability: 0.4, threshold: 0.5 },
    ]);
    expect(score).toBe(0.78);
  });
});
