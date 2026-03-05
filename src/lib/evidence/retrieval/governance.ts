import type { RetrievalEvidenceCandidate } from './types';

const MAX_PER_SOURCE = 2;

function dedupeKey(item: { sourceName: string; url?: string; snippet: string }): string {
  return [
    item.sourceName.trim().toLowerCase(),
    (item.url ?? '').trim().toLowerCase(),
    item.snippet.trim().toLowerCase(),
  ].join('|');
}

export function applyGovernance(candidates: RetrievalEvidenceCandidate[], topK: number): RetrievalEvidenceCandidate[] {
  const seen = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const out: RetrievalEvidenceCandidate[] = [];

  for (const candidate of candidates.sort((a, b) => b.fusedScore - a.fusedScore)) {
    if (out.length >= topK) {
      break;
    }
    const key = dedupeKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    const normalizedSource = candidate.sourceName.trim().toLowerCase();
    const sourceCount = sourceCounts.get(normalizedSource) ?? 0;
    if (sourceCount >= MAX_PER_SOURCE) {
      continue;
    }
    seen.add(key);
    sourceCounts.set(normalizedSource, sourceCount + 1);
    out.push(candidate);
  }

  return out;
}

