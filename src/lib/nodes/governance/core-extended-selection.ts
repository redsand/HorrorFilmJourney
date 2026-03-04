export type TieredCandidate = {
  nodeSlug: string;
  movieId: string;
  finalScore: number;
  prototypeScore?: number;
  journeyScore: number;
  isCurated?: boolean;
};

export type SelectCoreExtendedInput = {
  candidates: TieredCandidate[];
  targetSizeByNode: Record<string, number>;
  coreThresholdByNode: Record<string, number>;
  coreMinScoreAbsoluteByNode?: Record<string, number>;
  corePickPercentileByNode?: Record<string, number>;
  coreMaxPerNodeByNode?: Record<string, number>;
  relaxationDelta?: number;
  relaxationPrototypeMin?: number;
  maxNodesPerMovie: number;
  disallowedPairs: Array<[string, string]>;
  maxExtendedByNode?: Record<string, number | null>;
  journeyMinCore?: number;
  journeyMinExtended?: number;
};

export type SelectCoreExtendedOutput = {
  coreByNode: Record<string, string[]>;
  extendedByNode: Record<string, string[]>;
  pickedPercentileActualByNode: Record<string, number>;
  coreMinScoreUsedByNode: Record<string, number>;
};

function toPairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function compareCandidate(a: TieredCandidate, b: TieredCandidate): number {
  return (b.finalScore - a.finalScore)
    || (b.journeyScore - a.journeyScore)
    || ((b.prototypeScore ?? 0) - (a.prototypeScore ?? 0))
    || a.nodeSlug.localeCompare(b.nodeSlug)
    || a.movieId.localeCompare(b.movieId);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function selectCoreAndExtendedAssignments(input: SelectCoreExtendedInput): SelectCoreExtendedOutput {
  const journeyMinCore = input.journeyMinCore ?? 0;
  const journeyMinExtended = input.journeyMinExtended ?? journeyMinCore;
  const relaxationDelta = input.relaxationDelta ?? 0.03;
  const relaxationPrototypeMin = input.relaxationPrototypeMin ?? 0.72;
  const candidatesByNode = new Map<string, TieredCandidate[]>();
  for (const candidate of input.candidates) {
    if (!candidate.isCurated && candidate.journeyScore < journeyMinExtended) {
      continue;
    }
    const list = candidatesByNode.get(candidate.nodeSlug) ?? [];
    list.push(candidate);
    candidatesByNode.set(candidate.nodeSlug, list);
  }

  const extendedByNode: Record<string, string[]> = {};
  for (const [nodeSlug, rows] of candidatesByNode.entries()) {
    const maxExtended = input.maxExtendedByNode?.[nodeSlug];
    const sorted = [...rows].sort(compareCandidate);
    const limited = typeof maxExtended === 'number'
      ? sorted.slice(0, Math.max(1, Math.floor(maxExtended)))
      : sorted;
    extendedByNode[nodeSlug] = limited.map((row) => row.movieId);
    candidatesByNode.set(nodeSlug, limited);
  }

  const coreByNode: Record<string, string[]> = Object.fromEntries(
    Object.keys(input.targetSizeByNode).map((nodeSlug) => [nodeSlug, [] as string[]]),
  );
  const pickedPercentileActualByNode: Record<string, number> = {};
  const coreMinScoreUsedByNode: Record<string, number> = {};
  const assignedCoreNodesByMovie = new Map<string, Set<string>>();
  const selectedKey = new Set<string>();

  const allRows = [...candidatesByNode.values()].flat().sort(compareCandidate);
  for (const candidate of allRows.filter((row) => row.isCurated)) {
    const nodeCore = coreByNode[candidate.nodeSlug] ?? [];
    if (nodeCore.includes(candidate.movieId)) {
      continue;
    }
    nodeCore.push(candidate.movieId);
    coreByNode[candidate.nodeSlug] = nodeCore;
    const assigned = assignedCoreNodesByMovie.get(candidate.movieId) ?? new Set<string>();
    assigned.add(candidate.nodeSlug);
    assignedCoreNodesByMovie.set(candidate.movieId, assigned);
    selectedKey.add(`${candidate.nodeSlug}::${candidate.movieId}`);
  }

  for (const nodeSlug of Object.keys(input.targetSizeByNode)) {
    const nodeCore = coreByNode[nodeSlug] ?? [];
    const curatedCount = nodeCore.length;
    const targetSize = Math.max(0, input.targetSizeByNode[nodeSlug] ?? 0);
    const coreMaxPerNode = Math.max(0, input.coreMaxPerNodeByNode?.[nodeSlug] ?? targetSize);
    const weakTarget = Math.max(0, Math.min(targetSize, coreMaxPerNode) - curatedCount);

    const coreCandidates = (candidatesByNode.get(nodeSlug) ?? [])
      .filter((candidate) => candidate.isCurated || candidate.journeyScore >= journeyMinCore)
      .filter((candidate) => !candidate.isCurated)
      .sort(compareCandidate);

    if (weakTarget === 0 || coreCandidates.length === 0) {
      pickedPercentileActualByNode[nodeSlug] = 0;
      coreMinScoreUsedByNode[nodeSlug] = input.coreMinScoreAbsoluteByNode?.[nodeSlug] ?? (input.coreThresholdByNode[nodeSlug] ?? 1);
      continue;
    }

    const pickPercentile = clamp01(input.corePickPercentileByNode?.[nodeSlug] ?? 1);
    const percentileRank = Math.max(1, Math.ceil(coreCandidates.length * pickPercentile));
    const percentileFloor = coreCandidates[Math.min(coreCandidates.length, percentileRank) - 1]?.finalScore ?? 1;
    const absoluteFloor = input.coreMinScoreAbsoluteByNode?.[nodeSlug] ?? (input.coreThresholdByNode[nodeSlug] ?? 1);
    const calibratedFloor = Math.max(absoluteFloor, percentileFloor);
    const relaxedFloor = Math.max(0, absoluteFloor - relaxationDelta);
    const scarceNode = coreCandidates.filter((candidate) => candidate.finalScore >= calibratedFloor).length < weakTarget;
    let coreMinUsed = calibratedFloor;

    const tryPick = (candidate: TieredCandidate): boolean => {
      const key = `${candidate.nodeSlug}::${candidate.movieId}`;
      if (selectedKey.has(key)) {
        return false;
      }
      if (nodeCore.length >= Math.min(targetSize, coreMaxPerNode)) {
        return false;
      }
      const movieCoreNodes = assignedCoreNodesByMovie.get(candidate.movieId) ?? new Set<string>();
      if (movieCoreNodes.size >= input.maxNodesPerMovie) {
        return false;
      }
      const blocked = [...movieCoreNodes].some((existingNode) =>
        input.disallowedPairs.some(([a, b]) => toPairKey(a, b) === toPairKey(existingNode, candidate.nodeSlug)));
      if (blocked) {
        return false;
      }
      nodeCore.push(candidate.movieId);
      coreByNode[candidate.nodeSlug] = nodeCore;
      movieCoreNodes.add(candidate.nodeSlug);
      assignedCoreNodesByMovie.set(candidate.movieId, movieCoreNodes);
      selectedKey.add(key);
      return true;
    };

    for (const candidate of coreCandidates) {
      if (nodeCore.length >= Math.min(targetSize, coreMaxPerNode)) {
        break;
      }
      if (candidate.finalScore < calibratedFloor) {
        continue;
      }
      tryPick(candidate);
    }

    if (scarceNode && nodeCore.length < Math.min(targetSize, coreMaxPerNode)) {
      for (const candidate of coreCandidates) {
        if (nodeCore.length >= Math.min(targetSize, coreMaxPerNode)) {
          break;
        }
        if (candidate.finalScore >= calibratedFloor) {
          continue;
        }
        if (candidate.finalScore < relaxedFloor) {
          continue;
        }
        if ((candidate.prototypeScore ?? 0) < relaxationPrototypeMin) {
          continue;
        }
        const picked = tryPick(candidate);
        if (picked) {
          coreMinUsed = Math.min(coreMinUsed, candidate.finalScore);
        }
      }
    }

    const selectedWeak = Math.max(0, nodeCore.length - curatedCount);
    pickedPercentileActualByNode[nodeSlug] = Number((selectedWeak / Math.max(1, coreCandidates.length)).toFixed(6));
    coreMinScoreUsedByNode[nodeSlug] = Number(coreMinUsed.toFixed(6));
  }

  return {
    coreByNode,
    extendedByNode,
    pickedPercentileActualByNode,
    coreMinScoreUsedByNode,
  };
}
