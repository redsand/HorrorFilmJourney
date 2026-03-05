export type EvidencePacketVM = {
  sourceName: string;
  url?: string;
  snippet: string;
  retrievedAt: string;
};

export type EvidenceRetrievalQuery = {
  region?: string;
  seasonSlug?: string;
  packId?: string | null;
  query?: string;
  topK?: number;
  includeExternalReadings?: boolean;
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
