import { describe, expect, it } from 'vitest';
import { evaluateRetrievalRolloutReadiness } from '@/lib/evidence/retrieval/rollout-readiness';

describe('retrieval rollout readiness', () => {
  it('passes all stages when sample size and metrics are strong', () => {
    const result = evaluateRetrievalRolloutReadiness({
      runCount: 320,
      metrics: {
        totalRuns: 320,
        emptyHitRate: 0.01,
        fallbackRate: 0.02,
        p95LatencyMs: 120,
        duplicateRate: 0.01,
        citationValidRate: 0.99,
      },
    });

    expect(result.pass).toBe(true);
    expect(result.stages.every((stage) => stage.pass)).toBe(true);
  });

  it('fails higher stages when run sample is too small', () => {
    const result = evaluateRetrievalRolloutReadiness({
      runCount: 25,
      metrics: {
        totalRuns: 25,
        emptyHitRate: 0,
        fallbackRate: 0,
        p95LatencyMs: 100,
        duplicateRate: 0,
        citationValidRate: 1,
      },
    });

    expect(result.stages.find((stage) => stage.stage === 'canary-10')?.pass).toBe(true);
    expect(result.stages.find((stage) => stage.stage === 'ramp-50')?.pass).toBe(false);
    expect(result.stages.find((stage) => stage.stage === 'full-100')?.pass).toBe(false);
  });
});
