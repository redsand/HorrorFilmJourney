export function prioritizeCoreThenExtended(
  coreMovieIds: string[],
  extendedMovieIds: string[],
  targetCount: number,
): string[] {
  if (targetCount <= 0) {
    return [];
  }
  const out: string[] = [];
  for (const id of coreMovieIds) {
    if (out.includes(id)) {
      continue;
    }
    out.push(id);
    if (out.length >= targetCount) {
      return out;
    }
  }
  for (const id of extendedMovieIds) {
    if (out.includes(id)) {
      continue;
    }
    out.push(id);
    if (out.length >= targetCount) {
      return out;
    }
  }
  return out;
}
