export type GroundingChunk = {
  documentId: string;
  chunkId: string;
  snippet: string;
};

export type GroundingEvaluationCase = {
  query: string;
  seasonSlug: string;
  answer: string;
  chunks: GroundingChunk[];
  abstained: boolean;
  expectedAbstain: boolean;
};

export const DEFAULT_GROUNDING_REFUSAL_TEMPLATE =
  'I do not have enough season-scoped evidence to answer this confidently. Please try again after more evidence is indexed.';

const CITATION_PATTERN = /\[doc:[^\]\s]+\s+chunk:[^\]\s]+\]/;

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function tokenize(value: string): string[] {
  return value
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 4);
}

export function formatChunkCitation(chunk: GroundingChunk): string {
  return `[doc:${chunk.documentId} chunk:${chunk.chunkId}]`;
}

export function hasGroundingCitation(value: string): boolean {
  return CITATION_PATTERN.test(value);
}

export function enforceCitationOnLine(line: string, chunk: GroundingChunk | null): string {
  const trimmed = line.trim();
  if (trimmed.length === 0 || hasGroundingCitation(trimmed) || !chunk) {
    return trimmed;
  }
  return `${trimmed} ${formatChunkCitation(chunk)}`;
}

export function enforceCitationCoverage(lines: string[], chunks: GroundingChunk[]): string[] {
  if (chunks.length === 0) {
    return lines.map((line) => line.trim()).filter((line) => line.length > 0);
  }
  return lines
    .map((line, index) => enforceCitationOnLine(line, chunks[index % chunks.length] ?? chunks[0]!))
    .filter((line) => line.length > 0);
}

export function computeGroundingMetrics(cases: GroundingEvaluationCase[]): {
  total: number;
  citationCoverageRate: number;
  abstainPrecision: number;
  hallucinationRiskCases: Array<{ query: string; seasonSlug: string; answer: string }>;
} {
  let citedClaims = 0;
  let totalClaims = 0;
  let abstainExpected = 0;
  let abstainCorrect = 0;
  const hallucinationRiskCases: Array<{ query: string; seasonSlug: string; answer: string }> = [];

  for (const row of cases) {
    if (row.expectedAbstain) {
      abstainExpected += 1;
      if (row.abstained) {
        abstainCorrect += 1;
      }
    }

    if (row.abstained) {
      continue;
    }

    const byLine = row.answer
      .split('\n')
      .map((claim) => claim.trim())
      .filter((claim) => claim.length > 0);
    const claims = byLine.length > 1
      ? byLine
      : row.answer
        .split(/(?<=[.!?])\s+/)
        .map((claim) => claim.trim())
        .filter((claim) => claim.length > 0);

    for (const claim of claims) {
      totalClaims += 1;
      if (hasGroundingCitation(claim)) {
        citedClaims += 1;
      } else {
        hallucinationRiskCases.push({
          query: row.query,
          seasonSlug: row.seasonSlug,
          answer: row.answer,
        });
      }
    }

    const claimTokens = tokenize(row.answer);
    const chunkTokens = new Set(row.chunks.flatMap((chunk) => tokenize(chunk.snippet)));
    const overlap = claimTokens.filter((token) => chunkTokens.has(token)).length;
    if (claimTokens.length > 0 && overlap === 0) {
      hallucinationRiskCases.push({
        query: row.query,
        seasonSlug: row.seasonSlug,
        answer: row.answer,
      });
    }
  }

  return {
    total: cases.length,
    citationCoverageRate: totalClaims === 0 ? 1 : citedClaims / totalClaims,
    abstainPrecision: abstainExpected === 0 ? 1 : abstainCorrect / abstainExpected,
    hallucinationRiskCases,
  };
}
