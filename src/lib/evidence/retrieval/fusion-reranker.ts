import type { EvidencePacketVM } from '@/lib/evidence/evidence-retriever';
import type { RetrievalEvidenceCandidate } from './types';

const RRF_K = 60;

function rankBy(values: number[]): number[] {
  return values
    .map((score, index) => ({ index, score }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.index);
}

export function reciprocalRankFusion(
  items: EvidencePacketVM[],
  lexicalScores: number[],
  semanticScores: number[],
): RetrievalEvidenceCandidate[] {
  const lexicalOrder = rankBy(lexicalScores);
  const semanticOrder = rankBy(semanticScores);
  const rankLexical = new Map(lexicalOrder.map((idx, rank) => [idx, rank + 1]));
  const rankSemantic = new Map(semanticOrder.map((idx, rank) => [idx, rank + 1]));

  return items.map((item, index) => {
    const lRank = rankLexical.get(index) ?? items.length;
    const sRank = rankSemantic.get(index) ?? items.length;
    const fusedScore = (1 / (RRF_K + lRank)) + (1 / (RRF_K + sRank));
    return {
      ...item,
      lexicalScore: lexicalScores[index] ?? 0,
      semanticScore: semanticScores[index] ?? 0,
      fusedScore,
      rankLexical: lRank,
      rankSemantic: sRank,
    };
  });
}
