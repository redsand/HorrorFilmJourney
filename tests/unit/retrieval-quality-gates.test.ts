import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETRIEVAL_GATE_THRESHOLDS,
  evaluateRetrievalQualityGates,
} from '@/lib/evidence/retrieval/quality-gates';

describe('retrieval quality gates', () => {
  it('passes when metrics are within thresholds', () => {
    const report = evaluateRetrievalQualityGates({
      totalRuns: 100,
      emptyHitRate: 0.08,
      fallbackRate: 0.05,
      p95LatencyMs: 140,
      duplicateRate: 0.02,
      citationValidRate: 0.97,
    });

    expect(report.pass).toBe(true);
    expect(report.failed.length).toBe(0);
  });

  it('fails and reports reasons when metrics breach thresholds', () => {
    const report = evaluateRetrievalQualityGates({
      totalRuns: 100,
      emptyHitRate: DEFAULT_RETRIEVAL_GATE_THRESHOLDS.maxEmptyHitRate + 0.01,
      fallbackRate: DEFAULT_RETRIEVAL_GATE_THRESHOLDS.maxFallbackRate + 0.01,
      p95LatencyMs: DEFAULT_RETRIEVAL_GATE_THRESHOLDS.maxP95LatencyMs + 1,
      duplicateRate: DEFAULT_RETRIEVAL_GATE_THRESHOLDS.maxDuplicateRate + 0.01,
      citationValidRate: DEFAULT_RETRIEVAL_GATE_THRESHOLDS.minCitationValidRate - 0.01,
    });

    expect(report.pass).toBe(false);
    expect(report.failed.length).toBe(5);
    expect(report.failed.some((row) => row.metric === 'emptyHitRate')).toBe(true);
    expect(report.failed.some((row) => row.metric === 'fallbackRate')).toBe(true);
    expect(report.failed.some((row) => row.metric === 'p95LatencyMs')).toBe(true);
    expect(report.failed.some((row) => row.metric === 'duplicateRate')).toBe(true);
    expect(report.failed.some((row) => row.metric === 'citationValidRate')).toBe(true);
  });
});

