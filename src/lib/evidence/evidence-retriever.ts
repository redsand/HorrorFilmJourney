export type EvidencePacketVM = {
  sourceName: string;
  url?: string;
  snippet: string;
  retrievedAt: string;
};

export interface EvidenceRetriever {
  getEvidence(movieId: string): Promise<EvidencePacketVM[]>;
}
