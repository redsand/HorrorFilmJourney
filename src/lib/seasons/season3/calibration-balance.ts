export type NodeProb = {
  nodeSlug: string;
  probability: number;
  threshold: number;
};

export type BalancedCandidate = {
  tmdbId: number;
  strength: number;
  topNodes?: NodeProb[];
};

type BalanceOptions = {
  targetCount: number;
  perNodeFloor: number;
  nodeSlugs: string[];
};

function nodeProbability(candidate: BalancedCandidate, nodeSlug: string): number {
  const nodes = Array.isArray(candidate.topNodes) ? candidate.topNodes : [];
  for (const node of nodes) {
    if (node.nodeSlug === nodeSlug && Number.isFinite(node.probability)) {
      return Math.max(0, node.probability);
    }
  }
  return 0;
}

function compareByStrength(a: BalancedCandidate, b: BalancedCandidate): number {
  return (b.strength - a.strength) || (a.tmdbId - b.tmdbId);
}

export function selectBalancedCandidates(
  candidates: BalancedCandidate[],
  options: BalanceOptions,
): BalancedCandidate[] {
  const targetCount = Math.max(0, options.targetCount);
  const nodeSlugs = [...options.nodeSlugs];
  if (targetCount === 0 || candidates.length === 0 || nodeSlugs.length === 0) {
    return [];
  }

  const floorPerNode = Math.max(0, Math.min(options.perNodeFloor, Math.floor(targetCount / nodeSlugs.length)));
  const selectedByTmdb = new Set<number>();
  const selected: BalancedCandidate[] = [];

  for (const nodeSlug of nodeSlugs) {
    const rankedForNode = candidates
      .filter((candidate) => !selectedByTmdb.has(candidate.tmdbId) && nodeProbability(candidate, nodeSlug) > 0)
      .sort((a, b) => {
        const probDelta = nodeProbability(b, nodeSlug) - nodeProbability(a, nodeSlug);
        if (probDelta !== 0) return probDelta;
        return compareByStrength(a, b);
      });

    const picks = rankedForNode.slice(0, floorPerNode);
    for (const candidate of picks) {
      if (selectedByTmdb.has(candidate.tmdbId)) continue;
      selectedByTmdb.add(candidate.tmdbId);
      selected.push(candidate);
      if (selected.length >= targetCount) {
        return selected;
      }
    }
  }

  const remaining = candidates
    .filter((candidate) => !selectedByTmdb.has(candidate.tmdbId))
    .sort(compareByStrength);
  for (const candidate of remaining) {
    selected.push(candidate);
    if (selected.length >= targetCount) {
      break;
    }
  }

  return selected;
}
