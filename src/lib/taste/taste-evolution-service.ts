type TasteSnapshotLike = {
  takenAt: Date;
  intensityPreference: number;
  pacingPreference: number;
  psychologicalVsSupernatural: number;
  goreTolerance: number;
  ambiguityTolerance: number;
  nostalgiaBias: number;
  auteurAffinity: number;
};

export function tasteSnapshotInterval(): number {
  const parsed = Number.parseInt(process.env.TASTE_SNAPSHOT_INTERVAL ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 5;
  }
  return parsed;
}

function directionPhrase(delta: number, positive: string, negative: string): string {
  if (delta >= 0.08) {
    return positive;
  }
  if (delta <= -0.08) {
    return negative;
  }
  return 'remained relatively stable';
}

export function summarizeTasteEvolution(input: {
  snapshots: TasteSnapshotLike[];
  interactionSpan: number;
}): string {
  if (input.snapshots.length < 2) {
    return 'Not enough history yet. Keep rating films to unlock your evolution timeline.';
  }
  const sorted = [...input.snapshots].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const psychDelta = last.psychologicalVsSupernatural - first.psychologicalVsSupernatural;
  const paceDelta = last.pacingPreference - first.pacingPreference;

  const psychPhrase = directionPhrase(
    psychDelta,
    'shifted toward psychological themes',
    'shifted toward supernatural themes',
  );
  const pacePhrase = directionPhrase(
    paceDelta,
    'toward faster pacing',
    'toward slower-burn pacing',
  );
  const films = Math.max(0, input.interactionSpan);
  return `Your taste has ${psychPhrase} over ${films} films, with pacing ${pacePhrase}.`;
}
