import type {
  FiredLabel,
  LabelingFunction,
  NodeProbability,
  WeakSupervisionMovie,
} from './types.ts';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function toProbability(positive: number, negative: number): number {
  if (positive <= 0 && negative <= 0) {
    return 0;
  }

  const prior = 1.25;
  const total = positive + negative;
  const raw = positive / (total + prior);
  const conflict = total > 0 ? Math.min(positive, negative) / Math.max(positive, negative) : 0;
  const centered = (raw - 0.5) * 2;
  const softened = 0.5 + ((centered * (1 - (conflict * 0.75))) / 2);
  return clamp01(softened);
}

export function applyLabelModel(
  movie: WeakSupervisionMovie,
  nodeSlug: string,
  lfs: LabelingFunction[],
): NodeProbability {
  const fired: FiredLabel[] = [];
  let positiveWeight = 0;
  let negativeWeight = 0;

  for (const lf of lfs) {
    if (lf.nodeSlug !== nodeSlug) {
      continue;
    }

    const outcome = lf.apply(movie);
    const confidence = clamp01(outcome.confidence);
    if (outcome.label === 0 || confidence <= 0) {
      continue;
    }

    fired.push({
      lfName: lf.name,
      nodeSlug,
      label: outcome.label,
      confidence,
      evidence: outcome.evidence ?? [],
    });

    if (outcome.label === 1) {
      positiveWeight += confidence;
    } else if (outcome.label === -1) {
      negativeWeight += confidence;
    }
  }

  const probability = toProbability(positiveWeight, negativeWeight);

  return {
    nodeSlug,
    probability,
    fired,
    positiveWeight,
    negativeWeight,
  };
}

export function inferNodeProbabilities(
  movie: WeakSupervisionMovie,
  nodeSlugs: string[],
  lfs: LabelingFunction[],
): NodeProbability[] {
  return nodeSlugs.map((nodeSlug) => applyLabelModel(movie, nodeSlug, lfs));
}
