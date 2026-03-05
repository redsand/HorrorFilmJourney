export type RetrievalGateThresholds = {
  maxEmptyHitRate: number;
  maxFallbackRate: number;
  maxP95LatencyMs: number;
  maxDuplicateRate: number;
  minCitationValidRate: number;
};

export const DEFAULT_RETRIEVAL_GATE_THRESHOLDS: RetrievalGateThresholds = {
  maxEmptyHitRate: 0.15,
  maxFallbackRate: 0.2,
  maxP95LatencyMs: 450,
  maxDuplicateRate: 0.1,
  minCitationValidRate: 0.95,
};

export type RetrievalGateMetrics = {
  totalRuns: number;
  emptyHitRate: number;
  fallbackRate: number;
  p95LatencyMs: number;
  duplicateRate: number;
  citationValidRate: number;
};

export type RetrievalGateResult = {
  pass: boolean;
  thresholds: RetrievalGateThresholds;
  metrics: RetrievalGateMetrics;
  failed: Array<{
    metric: keyof Omit<RetrievalGateMetrics, 'totalRuns'>;
    value: number;
    threshold: number;
    comparator: '<=' | '>=';
  }>;
};

export function evaluateRetrievalQualityGates(
  metrics: RetrievalGateMetrics,
  thresholds: RetrievalGateThresholds = DEFAULT_RETRIEVAL_GATE_THRESHOLDS,
): RetrievalGateResult {
  const failed: RetrievalGateResult['failed'] = [];

  if (metrics.emptyHitRate > thresholds.maxEmptyHitRate) {
    failed.push({
      metric: 'emptyHitRate',
      value: metrics.emptyHitRate,
      threshold: thresholds.maxEmptyHitRate,
      comparator: '<=',
    });
  }
  if (metrics.fallbackRate > thresholds.maxFallbackRate) {
    failed.push({
      metric: 'fallbackRate',
      value: metrics.fallbackRate,
      threshold: thresholds.maxFallbackRate,
      comparator: '<=',
    });
  }
  if (metrics.p95LatencyMs > thresholds.maxP95LatencyMs) {
    failed.push({
      metric: 'p95LatencyMs',
      value: metrics.p95LatencyMs,
      threshold: thresholds.maxP95LatencyMs,
      comparator: '<=',
    });
  }
  if (metrics.duplicateRate > thresholds.maxDuplicateRate) {
    failed.push({
      metric: 'duplicateRate',
      value: metrics.duplicateRate,
      threshold: thresholds.maxDuplicateRate,
      comparator: '<=',
    });
  }
  if (metrics.citationValidRate < thresholds.minCitationValidRate) {
    failed.push({
      metric: 'citationValidRate',
      value: metrics.citationValidRate,
      threshold: thresholds.minCitationValidRate,
      comparator: '>=',
    });
  }

  return {
    pass: failed.length === 0,
    thresholds,
    metrics,
    failed,
  };
}

