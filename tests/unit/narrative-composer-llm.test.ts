import { describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '@/ai/llmProvider';
import { recommendationCardNarrativeSchema } from '@/lib/contracts/narrative-contracts';
import type { CandidateMovie } from '@/lib/recommendation/recommendation-engine-v1';
import { composeCardNarrative } from '@/lib/recommendation/recommendation-engine';

const movieFixture: CandidateMovie = {
  id: 'movie_internal_id',
  tmdbId: 123,
  title: 'Narrative Fixture',
  year: 1999,
  posterUrl: 'https://img/123.jpg',
  genres: ['horror', 'psychological'],
  ratings: {
    imdb: { value: 7.8, scale: '10', rawValue: '7.8/10' },
    additional: [
      { source: 'ROTTEN_TOMATOES', value: 90, scale: '100', rawValue: '90%' },
      { source: 'METACRITIC', value: 78, scale: '100', rawValue: '78/100' },
    ],
  },
};

function makeProvider(generateJsonImpl: LlmProvider['generateJson']): LlmProvider {
  return {
    name: () => 'unknown',
    generateJson: generateJsonImpl,
  };
}

describe('composeCardNarrative LLM integration', () => {
  it('uses provider output when provider returns valid schema JSON', async () => {
    const generateJsonMock = vi.fn().mockResolvedValue({
      whyImportant: 'LLM reason [E1]',
      whatItTeaches: 'LLM teaching [E1]',
      watchFor: ['a', 'b', 'c'],
      historicalContext: 'LLM context',
      reception: { summary: 'LLM reception' },
      castHighlights: [],
      streaming: [],
      spoilerPolicy: 'NO_SPOILERS',
      journeyNode: 'ENGINE_V1_CORE#RANK_1',
      nextStepHint: 'LLM next',
      ratings: movieFixture.ratings,
    });

    const provider = makeProvider(generateJsonMock);
    const result = await composeCardNarrative({
      movie: movieFixture,
      userProfile: { tolerance: 4, userId: 'secret-user-id', email: 'secret@example.com' },
      journeyNode: 'ENGINE_V1_CORE#RANK_1',
      evidencePackets: [{ sourceName: 'SourceA', snippet: 'EvidenceA', retrievedAt: '2026-01-01T00:00:00.000Z' }],
      llmProvider: provider,
    });

    expect(result.whyImportant).toBe('LLM reason [E1]');
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
    expect(generateJsonMock.mock.calls[0]?.[0].system).toContain('Do not claim facts not supported by evidence');
    expect(generateJsonMock.mock.calls[0]?.[0].user).toContain('"evidence"');
    expect(generateJsonMock.mock.calls[0]?.[0].user).toContain('"id":"E1"');
    expect(generateJsonMock.mock.calls[0]?.[0].user).not.toContain('secret-user-id');
    expect(generateJsonMock.mock.calls[0]?.[0].user).not.toContain('secret@example.com');
    expect(generateJsonMock.mock.calls[0]?.[0].user).not.toContain('movie_internal_id');
    expect(() => recommendationCardNarrativeSchema.parse(result)).not.toThrow();
  });

  it('falls back to deterministic template when provider returns invalid schema JSON', async () => {
    const provider = makeProvider(
      vi.fn().mockResolvedValue({
        whyImportant: 'Invalid',
        whatItTeaches: 'Invalid',
      }),
    );

    const result = await composeCardNarrative({
      movie: movieFixture,
      userProfile: null,
      journeyNode: 'ENGINE_V1_CORE#RANK_2',
      evidencePackets: [],
      llmProvider: provider,
    });

    expect(result.whyImportant).toContain('Narrative Fixture expands your horror map');
    expect(() => recommendationCardNarrativeSchema.parse(result)).not.toThrow();
  });

  it('falls back to deterministic template when provider throws', async () => {
    const provider = makeProvider(vi.fn().mockRejectedValue(new Error('provider down')));

    const result = await composeCardNarrative({
      movie: movieFixture,
      userProfile: null,
      journeyNode: 'ENGINE_V1_CORE#RANK_3',
      evidencePackets: [],
      llmProvider: provider,
    });

    expect(result.whyImportant).toContain('Narrative Fixture expands your horror map');
    expect(() => recommendationCardNarrativeSchema.parse(result)).not.toThrow();
  });

  it('falls back to deterministic template when model returns invalid evidence refs', async () => {
    const provider = makeProvider(
      vi.fn().mockResolvedValue({
        whyImportant: 'Claim [E9]',
        whatItTeaches: 'Teach [E9]',
        watchFor: ['a', 'b', 'c'],
        historicalContext: 'Context [E9]',
        reception: {},
        castHighlights: [],
        streaming: [],
        spoilerPolicy: 'NO_SPOILERS',
        journeyNode: 'ENGINE_V1_CORE#RANK_1',
        nextStepHint: 'Next [E9]',
        ratings: movieFixture.ratings,
      }),
    );

    const result = await composeCardNarrative({
      movie: movieFixture,
      userProfile: null,
      journeyNode: 'ENGINE_V1_CORE#RANK_1',
      evidencePackets: [{ sourceName: 'SourceA', snippet: 'EvidenceA', retrievedAt: '2026-01-01T00:00:00.000Z' }],
      llmProvider: provider,
    });

    expect(result.whyImportant).toContain('Narrative Fixture expands your horror map');
    expect(() => recommendationCardNarrativeSchema.parse(result)).not.toThrow();
  });
});
