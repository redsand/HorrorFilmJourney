import { describe, expect, it } from 'vitest';
import { resolveDynamicMinVotes } from '@/lib/audit/toplist-robustness';

describe('toplist robustness min-vote resolution', () => {
  it('keeps configured minimum when enough rows meet it', () => {
    const minVotes = resolveDynamicMinVotes({
      voteCounts: [5000, 4000, 3000, 2000, 1000, 500, 300],
      targetSize: 5,
      configuredMinVotes: 1000,
    });
    expect(minVotes).toBe(1000);
  });

  it('lowers minimum dynamically to fill target size when needed', () => {
    const minVotes = resolveDynamicMinVotes({
      voteCounts: [900, 800, 700, 600, 500, 400, 300, 200],
      targetSize: 5,
      configuredMinVotes: 1000,
    });
    expect(minVotes).toBe(500);
  });

  it('never uses zero votes and falls back to 1 when pool is small', () => {
    const minVotes = resolveDynamicMinVotes({
      voteCounts: [100, 50, 0, 0],
      targetSize: 10,
      configuredMinVotes: 1000,
    });
    expect(minVotes).toBe(1);
  });
});

