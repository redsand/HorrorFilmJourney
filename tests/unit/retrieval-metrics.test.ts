import { describe, expect, it } from 'vitest';
import { computeRetrievalGateMetricsFromRuns } from '@/lib/evidence/retrieval/metrics';

describe('retrieval metrics', () => {
  it('computes rates and p95 from run rows', () => {
    const metrics = computeRetrievalGateMetricsFromRuns([
      { selectedCount: 0, fallbackUsed: true, latencyMs: 100, duplicateRate: 0.2, citationValidRate: 0.9 },
      { selectedCount: 5, fallbackUsed: false, latencyMs: 200, duplicateRate: 0.1, citationValidRate: 1.0 },
      { selectedCount: 3, fallbackUsed: false, latencyMs: 300, duplicateRate: 0.0, citationValidRate: 0.95 },
    ]);

    expect(metrics.totalRuns).toBe(3);
    expect(metrics.emptyHitRate).toBeCloseTo(1 / 3, 6);
    expect(metrics.fallbackRate).toBeCloseTo(1 / 3, 6);
    expect(metrics.p95LatencyMs).toBe(300);
    expect(metrics.duplicateRate).toBeCloseTo(0.1, 6);
    expect(metrics.citationValidRate).toBeCloseTo((0.9 + 1 + 0.95) / 3, 6);
  });

  it('uses safe defaults when optional metrics are missing', () => {
    const metrics = computeRetrievalGateMetricsFromRuns([
      { selectedCount: 1, fallbackUsed: false, latencyMs: 10 },
    ]);

    expect(metrics.duplicateRate).toBe(0);
    expect(metrics.citationValidRate).toBe(1);
  });
});

