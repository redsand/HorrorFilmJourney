import type { RetrievalGateMetrics } from './quality-gates';

export type RetrievalRunMetricsLike = {
  selectedCount: number;
  fallbackUsed: boolean;
  latencyMs: number;
  duplicateRate?: number | null;
  citationValidRate?: number | null;
};

function percentile(values: number[], pct: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[rank] ?? 0;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeRetrievalGateMetricsFromRuns(runs: RetrievalRunMetricsLike[]): RetrievalGateMetrics {
  const totalRuns = runs.length;
  const emptyHitRate = totalRuns > 0
    ? runs.filter((run) => run.selectedCount === 0).length / totalRuns
    : 0;
  const fallbackRate = totalRuns > 0
    ? runs.filter((run) => run.fallbackUsed).length / totalRuns
    : 0;
  const p95LatencyMs = percentile(runs.map((run) => run.latencyMs), 95);
  const duplicateRate = average(
    runs
      .map((run) => run.duplicateRate)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  );
  const citationValues = runs
    .map((run) => run.citationValidRate)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const citationValidRate = citationValues.length > 0 ? average(citationValues) : 1;

  return {
    totalRuns,
    emptyHitRate,
    fallbackRate,
    p95LatencyMs,
    duplicateRate,
    citationValidRate,
  };
}

