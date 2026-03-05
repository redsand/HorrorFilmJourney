import type { RetrievalGateMetrics } from './quality-gates';
import { evaluateRetrievalQualityGates } from './quality-gates';

export type RetrievalRolloutReadiness = {
  pass: boolean;
  stages: Array<{
    stage: 'canary-10' | 'ramp-50' | 'full-100';
    pass: boolean;
    minRuns: number;
    runCount: number;
    detail: string;
  }>;
};

function stageCheck(input: {
  stage: 'canary-10' | 'ramp-50' | 'full-100';
  minRuns: number;
  runCount: number;
  metrics: RetrievalGateMetrics;
  extraRule: (metrics: RetrievalGateMetrics) => boolean;
  extraDetail: string;
}): RetrievalRolloutReadiness['stages'][number] {
  const gate = evaluateRetrievalQualityGates(input.metrics);
  const enoughRuns = input.runCount >= input.minRuns;
  const extraPass = input.extraRule(input.metrics);
  const pass = gate.pass && enoughRuns && extraPass;
  return {
    stage: input.stage,
    pass,
    minRuns: input.minRuns,
    runCount: input.runCount,
    detail: pass
      ? `ready: gates pass, runCount=${input.runCount}`
      : [
          gate.pass ? null : `gates failing (${gate.failed.map((f) => f.metric).join(', ')})`,
          enoughRuns ? null : `insufficient runs (${input.runCount}/${input.minRuns})`,
          extraPass ? null : input.extraDetail,
        ].filter((x): x is string => Boolean(x)).join('; '),
  };
}

export function evaluateRetrievalRolloutReadiness(input: {
  runCount: number;
  metrics: RetrievalGateMetrics;
}): RetrievalRolloutReadiness {
  const stages: RetrievalRolloutReadiness['stages'] = [
    stageCheck({
      stage: 'canary-10',
      minRuns: 20,
      runCount: input.runCount,
      metrics: input.metrics,
      extraRule: () => true,
      extraDetail: '',
    }),
    stageCheck({
      stage: 'ramp-50',
      minRuns: 100,
      runCount: input.runCount,
      metrics: input.metrics,
      extraRule: (metrics) => metrics.fallbackRate <= 0.15,
      extraDetail: 'fallbackRate above 0.15',
    }),
    stageCheck({
      stage: 'full-100',
      minRuns: 300,
      runCount: input.runCount,
      metrics: input.metrics,
      extraRule: (metrics) => metrics.p95LatencyMs <= 400 && metrics.citationValidRate >= 0.97,
      extraDetail: 'p95Latency > 400ms or citationValidRate < 0.97',
    }),
  ];

  return {
    pass: stages.every((stage) => stage.pass),
    stages,
  };
}
