import { describe, expect, it } from 'vitest';
import { evaluateRetrievalQualityGates } from '@/lib/evidence/retrieval/quality-gates';
import { evaluateRetrievalValueGoals } from '@/lib/evidence/retrieval/value-goals';

describe('retrieval value goals', () => {
  it('passes when health, corpus, and observability goals are met', () => {
    const gateResult = evaluateRetrievalQualityGates({
      totalRuns: 50,
      emptyHitRate: 0.05,
      fallbackRate: 0.05,
      p95LatencyMs: 100,
      duplicateRate: 0.01,
      citationValidRate: 0.99,
    });

    const report = evaluateRetrievalValueGoals({
      gateResult,
      evidenceDocumentCount: 10,
      evidenceChunkCount: 100,
      retrievalRunCount: 50,
      thresholds: {
        minEvidenceDocuments: 5,
        minEvidenceChunks: 50,
        minRetrievalRuns: 20,
      },
    });

    expect(report.pass).toBe(true);
    expect(report.goals.every((goal) => goal.pass)).toBe(true);
  });

  it('fails when observability sample is too small', () => {
    const gateResult = evaluateRetrievalQualityGates({
      totalRuns: 2,
      emptyHitRate: 0,
      fallbackRate: 0,
      p95LatencyMs: 20,
      duplicateRate: 0,
      citationValidRate: 1,
    });

    const report = evaluateRetrievalValueGoals({
      gateResult,
      evidenceDocumentCount: 3,
      evidenceChunkCount: 20,
      retrievalRunCount: 2,
      thresholds: {
        minEvidenceDocuments: 1,
        minEvidenceChunks: 1,
        minRetrievalRuns: 10,
      },
    });

    expect(report.pass).toBe(false);
    expect(report.goals.find((goal) => goal.id === 'observability-sample')?.pass).toBe(false);
  });
});
