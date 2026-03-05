import type { EvidencePacketVM, EvidenceRetrievalQuery } from '@/lib/evidence/evidence-retriever';

export type RetrievalEvidenceCandidate = EvidencePacketVM & {
  lexicalScore: number;
  semanticScore: number;
  fusedScore: number;
  rankLexical: number;
  rankSemantic: number;
};

export type RetrievalContext = {
  movieId: string;
  query: EvidenceRetrievalQuery;
};

export interface EvidenceRetrieverV2 {
  retrieve(context: RetrievalContext): Promise<EvidencePacketVM[]>;
}

