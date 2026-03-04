export type ResolveDynamicMinVotesInput = {
  voteCounts: number[];
  targetSize: number;
  configuredMinVotes: number;
};

function toInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value);
}

export function resolveDynamicMinVotes(input: ResolveDynamicMinVotesInput): number {
  const targetSize = Math.max(1, toInt(input.targetSize));
  const configuredMinVotes = Math.max(1, toInt(input.configuredMinVotes));
  const positiveVotes = input.voteCounts
    .map((value) => toInt(value))
    .filter((value) => value > 0)
    .sort((a, b) => b - a);

  if (positiveVotes.length === 0) {
    return configuredMinVotes;
  }

  const aboveConfigured = positiveVotes.filter((value) => value >= configuredMinVotes);
  if (aboveConfigured.length >= targetSize) {
    return configuredMinVotes;
  }

  if (positiveVotes.length < targetSize) {
    return 1;
  }

  const dynamicAtTarget = positiveVotes[targetSize - 1] ?? 1;
  return Math.max(1, dynamicAtTarget);
}

