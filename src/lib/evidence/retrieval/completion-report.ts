import type { RetrievalGateResult } from './quality-gates';
import type { RetrievalRolloutReadiness } from './rollout-readiness';
import type { RetrievalValueGoalReport } from './value-goals';

export type RetrievalCompletionReport = {
  pass: boolean;
  measuredAt: string;
  tracker: {
    pass: boolean;
    uncheckedCount: number;
  };
  retrieval: {
    gatesPass: boolean;
    valueGoalsPass: boolean;
    rolloutPass: boolean;
    runCount: number;
  };
  details: {
    gates: RetrievalGateResult;
    valueGoals: RetrievalValueGoalReport;
    rollout: RetrievalRolloutReadiness;
  };
};

export function buildRetrievalCompletionReport(input: {
  measuredAt: string;
  trackerUncheckedCount: number;
  retrievalRunCount: number;
  gates: RetrievalGateResult;
  valueGoals: RetrievalValueGoalReport;
  rollout: RetrievalRolloutReadiness;
}): RetrievalCompletionReport {
  const trackerPass = input.trackerUncheckedCount === 0;
  const pass = trackerPass && input.gates.pass && input.valueGoals.pass && input.rollout.pass;
  return {
    pass,
    measuredAt: input.measuredAt,
    tracker: {
      pass: trackerPass,
      uncheckedCount: input.trackerUncheckedCount,
    },
    retrieval: {
      gatesPass: input.gates.pass,
      valueGoalsPass: input.valueGoals.pass,
      rolloutPass: input.rollout.pass,
      runCount: input.retrievalRunCount,
    },
    details: {
      gates: input.gates,
      valueGoals: input.valueGoals,
      rollout: input.rollout,
    },
  };
}
