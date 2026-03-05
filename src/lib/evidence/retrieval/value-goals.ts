import type { RetrievalGateResult } from './quality-gates';

export type RetrievalValueGoalsThresholds = {
  minEvidenceDocuments: number;
  minEvidenceChunks: number;
  minRetrievalRuns: number;
};

export const DEFAULT_RETRIEVAL_VALUE_GOALS_THRESHOLDS: RetrievalValueGoalsThresholds = {
  minEvidenceDocuments: 1,
  minEvidenceChunks: 1,
  minRetrievalRuns: 20,
};

export type RetrievalValueGoalReport = {
  pass: boolean;
  thresholds: RetrievalValueGoalsThresholds;
  goals: Array<{
    id: 'retrieval-health' | 'corpus-coverage' | 'observability-sample';
    pass: boolean;
    detail: string;
  }>;
};

export function evaluateRetrievalValueGoals(input: {
  gateResult: RetrievalGateResult;
  evidenceDocumentCount: number;
  evidenceChunkCount: number;
  retrievalRunCount: number;
  thresholds?: RetrievalValueGoalsThresholds;
}): RetrievalValueGoalReport {
  const thresholds = input.thresholds ?? DEFAULT_RETRIEVAL_VALUE_GOALS_THRESHOLDS;
  const goals: RetrievalValueGoalReport['goals'] = [
    {
      id: 'retrieval-health',
      pass: input.gateResult.pass,
      detail: input.gateResult.pass
        ? 'Retrieval quality gates are passing.'
        : `Retrieval quality gates failing: ${input.gateResult.failed.map((item) => item.metric).join(', ')}`,
    },
    {
      id: 'corpus-coverage',
      pass: input.evidenceDocumentCount >= thresholds.minEvidenceDocuments
        && input.evidenceChunkCount >= thresholds.minEvidenceChunks,
      detail: `documents=${input.evidenceDocumentCount} (min ${thresholds.minEvidenceDocuments}), chunks=${input.evidenceChunkCount} (min ${thresholds.minEvidenceChunks})`,
    },
    {
      id: 'observability-sample',
      pass: input.retrievalRunCount >= thresholds.minRetrievalRuns,
      detail: `retrievalRuns=${input.retrievalRunCount} (min ${thresholds.minRetrievalRuns})`,
    },
  ];

  return {
    pass: goals.every((goal) => goal.pass),
    thresholds,
    goals,
  };
}
