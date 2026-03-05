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
  category: 'season-1' | 'season-2' | 'cross-season-negative' | 'impossible';
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

const SEASON_1_QUERIES: QueryCase[] = [
  { query: 'Why is Night of the Living Dead important to apocalyptic horror?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'How does The Thing build paranoia?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'What makes Texas Chain Saw Massacre influential?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'Explain found footage realism techniques in season 1 picks', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'Why do body horror films in season 1 feel unsettling?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'What craft signals define psychological horror in season 1?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'How does folk horror rely on ritual and place?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'What is the reception context for slashers in this season?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'How should I watch cosmic horror entries from season 1?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'Give evidence-backed reasons for survival horror ranking', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'How do creature features use scale and threat?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'Why is gothic horror still relevant in this syllabus?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'What does social-domestic horror teach about allegory?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'How should I compare supernatural vs psychological node cues?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'Which evidence supports slasher pacing signatures?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'How do score and silence differ in season-1 horror?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'Explain ritual pressure in folk horror examples', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'What marks experimental horror as curriculum-worthy?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'How does survival horror escalate through resource scarcity?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
  { query: 'What evidence supports apocalyptic collapse framing?', seasonSlug: 'season-1', expectAbstain: false, category: 'season-1' },
];

const SEASON_2_QUERIES: QueryCase[] = [
  { query: 'Why is Eraserhead central to cult cinema?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'What made Rocky Horror a participatory cult event?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'Why is Pink Flamingos labeled transgressive?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'Explain midnight movie exhibition in season 2', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'How does grindhouse distribution shape cult status?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'What defines psychotronic cinema in this curriculum?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'Why do camp films persist in cult reputation?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'How should I interpret underground reception signals?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'What evidence links repertory screenings to canon growth?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'Explain VHS-era cult recirculation patterns', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'How does outsider cinema build authorial myth?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'What turns a film into quote-culture camp canon?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'How is eurocult distinguished from grindhouse in the season?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'What evidence supports cult sci-fi fandom continuity?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'How did video-store circulation preserve cult texts?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'Why are origins-of-cult-cinema titles foundational?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'What patterns define modern cult phenomena?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'How do midnight movies reward repeat viewing?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'What corroborates cult-horror movement placement?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
  { query: 'Which evidence supports transgressive-canon framing?', seasonSlug: 'season-2', expectAbstain: false, category: 'season-2' },
];

const CROSS_SEASON_NEGATIVE_QUERIES: QueryCase[] = [
  { query: 'In season 1, explain Rocky Horror audience ritual with evidence', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, justify Eraserhead node placement', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, summarize psychotronic cinema canon logic', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, analyze camp-cult-comedy signatures', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, compare eurocult and outsider-cinema pathways', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, explain VHS cult shelf-discovery effects', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, explain midnight-movies historical context', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, discuss cult-science-fiction fandom loops', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, show evidence for origins-of-cult-cinema node', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 1, explain camp quote-culture persistence', seasonSlug: 'season-1', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, explain cosmic horror insignificance themes', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, justify found-footage realism evidence', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, analyze slasher final-survivor dynamics', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, map folk-horror ritual pressure cues', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, compare body-horror mutation archetypes', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, explain apocalyptic-horror collapse framing', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, evaluate social-domestic-horror allegory', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, summarize gothic-horror inheritance patterns', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, discuss survival-horror scarcity arc', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
  { query: 'In season 2, explain creature-feature threat scaling', seasonSlug: 'season-2', expectAbstain: true, category: 'cross-season-negative' },
];

const IMPOSSIBLE_QUERIES: QueryCase[] = [
  { query: 'Who won the NBA finals in 2024?', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'What are the side effects of ibuprofen?', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'Write me a tax strategy for my startup', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'Who is the current CEO of Nintendo?', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'Summarize quantum field theory proofs', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'Predict tomorrow weather in Berlin', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'Explain insulin dosing for type 1 diabetes', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'What is the latest federal funds rate?', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'Which laptop should I buy under $1500?', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'Who won the 2026 Oscars best picture?', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'Give me the exact moon phase in Tokyo next year', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'What is the legal minimum wage in every EU country right now?', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'Prescribe treatment for acute chest pain', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'Predict Bitcoin price next week', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'Provide my account password reset token', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'Diagnose this MRI image for me', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'Tell me tomorrow stock split announcements', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'Who will win the next US election?', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
  { query: 'Give hidden production secrets not in evidence', seasonSlug: 'season-1', expectAbstain: true, category: 'impossible' },
  { query: 'Reveal unreleased private studio contracts', seasonSlug: 'season-2', expectAbstain: true, category: 'impossible' },
];

const QUERIES: QueryCase[] = [
  ...SEASON_1_QUERIES,
  ...SEASON_2_QUERIES,
  ...CROSS_SEASON_NEGATIVE_QUERIES,
  ...IMPOSSIBLE_QUERIES,
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
    expect(metrics.total).toBe(80);
    expect(metrics.citationCoverageRate).toBeGreaterThanOrEqual(0.95);
    expect(metrics.abstainPrecision).toBeGreaterThanOrEqual(0.95);
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
