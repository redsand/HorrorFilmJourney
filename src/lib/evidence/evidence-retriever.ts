export type EvidenceProvenance = {
  retrievalMode: 'cache' | 'hybrid';
  sourceType: 'packet' | 'external_reading' | 'chunk';
  documentId?: string;
  seasonSlug?: string;
  packId?: string;
  taxonomyVersion?: string;
  fallbackUsed?: boolean;
  fallbackReason?: 'hybrid-error' | 'empty-hybrid';
  rank?: number;
  lexicalScore?: number;
  semanticScore?: number;
  fusedScore?: number;
  rankLexical?: number;
  rankSemantic?: number;
};

export type EvidencePacketVM = {
  sourceName: string;
  url?: string;
  snippet: string;
  retrievedAt: string;
  provenance?: EvidenceProvenance;
};

export type EvidenceRetrievalQuery = {
  region?: string;
  seasonSlug?: string;
  packId?: string | null;
  packSlug?: string | null;
  taxonomyVersion?: string | null;
  query?: string;
  topK?: number;
  includeExternalReadings?: boolean;
  allowCrossSeason?: boolean;
  requireSeasonContext?: boolean;
  callerId?: string;
};

export function normalizeEvidenceRetrievalQuery(
  input?: string | EvidenceRetrievalQuery,
): EvidenceRetrievalQuery {
  if (typeof input === 'string') {
    return { region: input };
  }
  return input ?? {};
}

export interface EvidenceRetriever {
  getEvidenceForMovie(movieId: string, query?: string | EvidenceRetrievalQuery): Promise<EvidencePacketVM[]>;
}
