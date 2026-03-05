import { describe, expect, it } from 'vitest';
import { buildRetrievalCompletionReport } from '@/lib/evidence/retrieval/completion-report';

describe('retrieval completion report', () => {
  it('passes when all gates are green and tracker is complete', () => {
    const report = buildRetrievalCompletionReport({
      measuredAt: '2026-03-05T00:00:00.000Z',
      trackerUncheckedCount: 0,
      retrievalRunCount: 300,
      gates: {
        pass: true,
        thresholds: {
          maxEmptyHitRate: 0.15,
          maxFallbackRate: 0.2,
          maxP95LatencyMs: 450,
          maxDuplicateRate: 0.1,
          minCitationValidRate: 0.95,
        },
        metrics: {
          totalRuns: 300,
          emptyHitRate: 0,
          fallbackRate: 0,
          p95LatencyMs: 5,
          duplicateRate: 0,
          citationValidRate: 1,
        },
        failed: [],
      },
      valueGoals: {
        pass: true,
        thresholds: {
          minEvidenceDocuments: 1,
          minEvidenceChunks: 1,
          minRetrievalRuns: 20,
        },
        goals: [],
      },
      rollout: {
        pass: true,
        stages: [],
      },
    });

    expect(report.pass).toBe(true);
    expect(report.tracker.pass).toBe(true);
    expect(report.retrieval.gatesPass).toBe(true);
    expect(report.retrieval.valueGoalsPass).toBe(true);
    expect(report.retrieval.rolloutPass).toBe(true);
  });

  it('fails when tracker has unchecked items', () => {
    const report = buildRetrievalCompletionReport({
      measuredAt: '2026-03-05T00:00:00.000Z',
      trackerUncheckedCount: 1,
      retrievalRunCount: 300,
      gates: {
        pass: true,
        thresholds: {
          maxEmptyHitRate: 0.15,
          maxFallbackRate: 0.2,
          maxP95LatencyMs: 450,
          maxDuplicateRate: 0.1,
          minCitationValidRate: 0.95,
        },
        metrics: {
          totalRuns: 300,
          emptyHitRate: 0,
          fallbackRate: 0,
          p95LatencyMs: 5,
          duplicateRate: 0,
          citationValidRate: 1,
        },
        failed: [],
      },
      valueGoals: {
        pass: true,
        thresholds: {
          minEvidenceDocuments: 1,
          minEvidenceChunks: 1,
          minRetrievalRuns: 20,
        },
        goals: [],
      },
      rollout: {
        pass: true,
        stages: [],
      },
    });

    expect(report.pass).toBe(false);
    expect(report.tracker.pass).toBe(false);
  });
});
