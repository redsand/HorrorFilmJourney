import type { EvidencePacketVM } from '@/lib/evidence/evidence-retriever';

export const MAX_EVIDENCE_PACKETS_PER_MOVIE = 5;
export const MAX_EVIDENCE_SNIPPET_LENGTH = 280;

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function sanitizeEvidenceSnippet(value: string): string {
  const cleaned = normalizeWhitespace(stripHtml(value));
  if (cleaned.length <= MAX_EVIDENCE_SNIPPET_LENGTH) {
    return cleaned;
  }

  return `${cleaned.slice(0, MAX_EVIDENCE_SNIPPET_LENGTH - 1)}…`;
}

export function packageEvidencePackets(
  evidence: EvidencePacketVM[],
  maxItems: number = MAX_EVIDENCE_PACKETS_PER_MOVIE,
): EvidencePacketVM[] {
  return evidence
    .slice(0, maxItems)
    .map((item) => ({
      ...item,
      snippet: sanitizeEvidenceSnippet(item.snippet),
    }));
}
