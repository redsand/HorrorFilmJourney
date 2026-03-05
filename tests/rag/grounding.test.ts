import { describe, expect, it } from 'vitest';
import {
  computeGroundingMetrics,
  DEFAULT_GROUNDING_REFUSAL_TEMPLATE,
  enforceCitationCoverage,
  formatChunkCitation,
  type GroundingChunk,
  type GroundingEvaluationCase,
} from '@/lib/rag/grounding';

const MIN_CHUNKS = 2;

type QueryCase = {
  query: string;
  seasonSlug: 'season-1' | 'season-2';
  expectAbstain: boolean;
};

const SEASON_1_CHUNKS: GroundingChunk[] = [
  { documentId: 's1_doc_a', chunkId: 's1_chunk_a1', snippet: 'Night of the Living Dead anchors apocalyptic dread through social collapse imagery.' },
  { documentId: 's1_doc_b', chunkId: 's1_chunk_b1', snippet: 'The Thing emphasizes practical effects, isolation, and paranoid group dynamics.' },
  { documentId: 's1_doc_c', chunkId: 's1_chunk_c1', snippet: 'The Texas Chain Saw Massacre uses documentary-like texture and relentless tension pacing.' },
];

const SEASON_2_CHUNKS: GroundingChunk[] = [
  { documentId: 's2_doc_a', chunkId: 's2_chunk_a1', snippet: 'Eraserhead became a midnight staple through surreal industrial anxiety and cult screenings.' },
  { documentId: 's2_doc_b', chunkId: 's2_chunk_b1', snippet: 'The Rocky Horror Picture Show sustained participatory audience ritual over decades.' },
  { documentId: 's2_doc_c', chunkId: 's2_chunk_c1', snippet: 'Pink Flamingos is cited for transgressive performance and underground counterculture distribution.' },
];

const QUERIES: QueryCase[] = [
  { query: 'Why is Night of the Living Dead important to apocalyptic horror?', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'How does The Thing build paranoia?', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'What makes Texas Chain Saw Massacre influential?', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'Explain found footage realism techniques in season 1 picks', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'Why do body horror films in season 1 feel unsettling?', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'What craft signals define psychological horror in season 1?', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'How does folk horror rely on ritual and place?', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'What is the reception context for slashers in this season?', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'How should I watch cosmic horror entries from season 1?', seasonSlug: 'season-1', expectAbstain: false },
  { query: 'Give evidence-backed reasons for survival horror ranking', seasonSlug: 'season-1', expectAbstain: false },

  { query: 'Why is Eraserhead central to cult cinema?', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'What made Rocky Horror a participatory cult event?', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'Why is Pink Flamingos labeled transgressive?', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'Explain midnight movie exhibition in season 2', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'How does grindhouse distribution shape cult status?', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'What defines psychotronic cinema in this curriculum?', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'Why do camp films persist in cult reputation?', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'How should I interpret underground reception signals?', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'What evidence links repertory screenings to canon growth?', seasonSlug: 'season-2', expectAbstain: false },
  { query: 'Explain VHS-era cult recirculation patterns', seasonSlug: 'season-2', expectAbstain: false },

  { query: 'Who won the NBA finals in 2024?', seasonSlug: 'season-1', expectAbstain: true },
  { query: 'What are the side effects of ibuprofen?', seasonSlug: 'season-1', expectAbstain: true },
  { query: 'Write me a tax strategy for my startup', seasonSlug: 'season-1', expectAbstain: true },
  { query: 'Who is the current CEO of Nintendo?', seasonSlug: 'season-1', expectAbstain: true },
  { query: 'Summarize quantum field theory proofs', seasonSlug: 'season-1', expectAbstain: true },
  { query: 'Predict tomorrow weather in Berlin', seasonSlug: 'season-2', expectAbstain: true },
  { query: 'Explain insulin dosing for type 1 diabetes', seasonSlug: 'season-2', expectAbstain: true },
  { query: 'What is the latest federal funds rate?', seasonSlug: 'season-2', expectAbstain: true },
  { query: 'Which laptop should I buy under $1500?', seasonSlug: 'season-2', expectAbstain: true },
  { query: 'Who won the 2026 Oscars best picture?', seasonSlug: 'season-2', expectAbstain: true },
];

function retrieveMockChunks(input: QueryCase): GroundingChunk[] {
  if (input.expectAbstain) {
    return [];
  }
  const corpus = input.seasonSlug === 'season-1' ? SEASON_1_CHUNKS : SEASON_2_CHUNKS;
  return corpus.slice(0, 2);
}

function buildMockAnswer(query: string, chunks: GroundingChunk[]): { answer: string; abstained: boolean } {
  if (chunks.length < MIN_CHUNKS) {
    return { answer: DEFAULT_GROUNDING_REFUSAL_TEMPLATE, abstained: true };
  }
  const lines = enforceCitationCoverage(
    [
      `Evidence indicates this topic is addressed directly in the indexed season material: ${chunks[0]!.snippet}`,
      `A corroborating note from another chunk reinforces the interpretation for "${query}". ${chunks[1]!.snippet}`,
    ],
    chunks,
  );
  return { answer: lines.join('\n'), abstained: false };
}

describe('rag grounding harness', () => {
  it('evaluates 30 mixed queries with citation and abstention metrics', () => {
    const evaluations: GroundingEvaluationCase[] = QUERIES.map((queryCase) => {
      const chunks = retrieveMockChunks(queryCase);
      const answer = buildMockAnswer(queryCase.query, chunks);
      return {
        query: queryCase.query,
        seasonSlug: queryCase.seasonSlug,
        answer: answer.answer,
        chunks,
        abstained: answer.abstained,
        expectedAbstain: queryCase.expectAbstain,
      };
    });

    const metrics = computeGroundingMetrics(evaluations);
    expect(metrics.total).toBe(30);
    expect(metrics.citationCoverageRate).toBe(1);
    expect(metrics.abstainPrecision).toBe(1);
    expect(metrics.hallucinationRiskCases).toHaveLength(0);
  });

  it('season-1 representative queries include doc/chunk citations', () => {
    const sample = QUERIES.filter((row) => row.seasonSlug === 'season-1' && !row.expectAbstain).slice(0, 3);
    for (const item of sample) {
      const chunks = retrieveMockChunks(item);
      const result = buildMockAnswer(item.query, chunks);
      expect(result.abstained).toBe(false);
      expect(result.answer).toContain(formatChunkCitation(chunks[0]!));
    }
  });

  it('season-2 representative queries include doc/chunk citations', () => {
    const sample = QUERIES.filter((row) => row.seasonSlug === 'season-2' && !row.expectAbstain).slice(0, 3);
    for (const item of sample) {
      const chunks = retrieveMockChunks(item);
      const result = buildMockAnswer(item.query, chunks);
      expect(result.abstained).toBe(false);
      expect(result.answer).toContain(formatChunkCitation(chunks[0]!));
    }
  });
});
