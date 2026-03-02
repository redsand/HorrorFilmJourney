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
});
