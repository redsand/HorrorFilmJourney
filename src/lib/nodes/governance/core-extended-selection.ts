export type TieredCandidate = {
  nodeSlug: string;
  movieId: string;
  finalScore: number;
  journeyScore: number;
  isCurated?: boolean;
};

export type SelectCoreExtendedInput = {
  candidates: TieredCandidate[];
  targetSizeByNode: Record<string, number>;
  coreThresholdByNode: Record<string, number>;
  maxNodesPerMovie: number;
  disallowedPairs: Array<[string, string]>;
  maxExtendedByNode?: Record<string, number | null>;
};

export type SelectCoreExtendedOutput = {
  coreByNode: Record<string, string[]>;
  extendedByNode: Record<string, string[]>;
};

function toPairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function compareCandidate(a: TieredCandidate, b: TieredCandidate): number {
  return (b.finalScore - a.finalScore)
    || (b.journeyScore - a.journeyScore)
    || a.nodeSlug.localeCompare(b.nodeSlug)
    || a.movieId.localeCompare(b.movieId);
}

export function selectCoreAndExtendedAssignments(input: SelectCoreExtendedInput): SelectCoreExtendedOutput {
  const candidatesByNode = new Map<string, TieredCandidate[]>();
  for (const candidate of input.candidates) {
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

  for (const pass of [true, false]) {
    for (const candidate of allRows) {
      const key = `${candidate.nodeSlug}::${candidate.movieId}`;
      if (selectedKey.has(key)) {
        continue;
      }
      const nodeTarget = Math.max(0, input.targetSizeByNode[candidate.nodeSlug] ?? 0);
      const nodeCore = coreByNode[candidate.nodeSlug] ?? [];
      if (nodeCore.length >= nodeTarget) {
        continue;
      }
      const threshold = input.coreThresholdByNode[candidate.nodeSlug] ?? 1;
      if (pass && candidate.finalScore < threshold) {
        continue;
      }
      const movieCoreNodes = assignedCoreNodesByMovie.get(candidate.movieId) ?? new Set<string>();
      if (movieCoreNodes.size >= input.maxNodesPerMovie) {
        continue;
      }
      const blocked = [...movieCoreNodes].some((existingNode) =>
        input.disallowedPairs.some(([a, b]) => toPairKey(a, b) === toPairKey(existingNode, candidate.nodeSlug)));
      if (blocked) {
        continue;
      }
      nodeCore.push(candidate.movieId);
      coreByNode[candidate.nodeSlug] = nodeCore;
      movieCoreNodes.add(candidate.nodeSlug);
      assignedCoreNodesByMovie.set(candidate.movieId, movieCoreNodes);
      selectedKey.add(key);
    }
  }

  return {
    coreByNode,
    extendedByNode,
  };
}
