import type { EvidencePacketVM } from '@/lib/evidence/evidence-retriever';

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

export function lexicalScoreEvidence(evidence: EvidencePacketVM[], queryText: string): number[] {
  const queryTokens = new Set(tokenize(queryText));
  if (queryTokens.size === 0) {
    return evidence.map(() => 0);
  }

  return evidence.map((item) => {
    const snippetTokens = tokenize(`${item.sourceName} ${item.snippet}`);
    if (snippetTokens.length === 0) {
      return 0;
    }
    const overlap = snippetTokens.filter((token) => queryTokens.has(token)).length;
    return overlap / Math.max(4, snippetTokens.length);
  });
}

