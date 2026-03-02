import { describe, expect, it } from 'vitest';
import {
  quickPollSchemaForStatus,
  recommendationCardNarrativeSchema,
} from '@/lib/contracts/narrative-contracts';

describe('narrative contracts', () => {
  it('rejects invalid ratings for WATCHED/ALREADY_SEEN', () => {
    const watchedSchema = quickPollSchemaForStatus('WATCHED');

    expect(watchedSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(watchedSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(watchedSchema.safeParse({}).success).toBe(false);
  });

  it('rejects watchFor length not equal to 3', () => {
    const tooShort = recommendationCardNarrativeSchema.safeParse({
      whyImportant: 'A',
      whatItTeaches: 'B',
      watchFor: ['x', 'y'],
      historicalContext: 'C',
      reception: {},
      castHighlights: [],
      streaming: [],
      spoilerPolicy: 'LIGHT',
      journeyNode: 'node-1',
      nextStepHint: 'hint',
      ratings: {
        imdb: { value: 7.8, scale: '10' },
        additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }],
      },
    });

    const tooLong = recommendationCardNarrativeSchema.safeParse({
      whyImportant: 'A',
      whatItTeaches: 'B',
      watchFor: ['x', 'y', 'z', 'w'],
      historicalContext: 'C',
      reception: {},
      castHighlights: [],
      streaming: [],
      spoilerPolicy: 'LIGHT',
      journeyNode: 'node-1',
      nextStepHint: 'hint',
      ratings: {
        imdb: { value: 7.8, scale: '10' },
        additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }],
      },
    });

    expect(tooShort.success).toBe(false);
    expect(tooLong.success).toBe(false);
  });

  it('caps emotions/workedBest arrays in quick poll', () => {
    const skippedSchema = quickPollSchemaForStatus('SKIPPED');
    const parsed = skippedSchema.parse({
      emotions: ['a', 'b', 'c', 'd', 'e', 'f'],
      workedBest: ['x', 'y', 'z', 'w'],
    });

    expect(parsed.emotions).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(parsed.workedBest).toEqual(['x', 'y', 'z']);
  });

  it('rejects missing imdb ratings', () => {
    const result = recommendationCardNarrativeSchema.safeParse({
      whyImportant: 'A',
      whatItTeaches: 'B',
      watchFor: ['x', 'y', 'z'],
      historicalContext: 'C',
      reception: {},
      castHighlights: [],
      streaming: [],
      spoilerPolicy: 'LIGHT',
      journeyNode: 'node-1',
      nextStepHint: 'hint',
      ratings: {
        additional: [{ source: 'ROTTEN_TOMATOES', value: 92, scale: '100' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing additional ratings', () => {
    const result = recommendationCardNarrativeSchema.safeParse({
      whyImportant: 'A',
      whatItTeaches: 'B',
      watchFor: ['x', 'y', 'z'],
      historicalContext: 'C',
      reception: {},
      castHighlights: [],
      streaming: [],
      spoilerPolicy: 'LIGHT',
      journeyNode: 'node-1',
      nextStepHint: 'hint',
      ratings: {
        imdb: { value: 7.8, scale: '10' },
        additional: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 4 rating sources', () => {
    const result = recommendationCardNarrativeSchema.safeParse({
      whyImportant: 'A',
      whatItTeaches: 'B',
      watchFor: ['x', 'y', 'z'],
      historicalContext: 'C',
      reception: {},
      castHighlights: [],
      streaming: [],
      spoilerPolicy: 'LIGHT',
      journeyNode: 'node-1',
      nextStepHint: 'hint',
      ratings: {
        imdb: { value: 7.8, scale: '10' },
        additional: [
          { source: 'ROTTEN_TOMATOES', value: 92, scale: '100' },
          { source: 'METACRITIC', value: 81, scale: '100' },
          { source: 'TMDB', value: 7.5, scale: '10' },
          { source: 'OTHER', value: 90, scale: '100' },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});
