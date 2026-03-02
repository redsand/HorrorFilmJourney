export type EvidencePacketVM = {
  sourceName: string;
  url?: string;
  snippet: string;
  retrievedAt: string;
};

export interface EvidenceRetriever {
  getEvidenceForMovie(movieId: string, region?: string): Promise<EvidencePacketVM[]>;
}
