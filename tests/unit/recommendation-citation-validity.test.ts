import { describe, expect, it } from 'vitest';
import { computeCitationValidRateFromNarrative } from '@/lib/recommendation/recommendation-engine';
import type { RecommendationCardNarrative } from '@/lib/contracts/narrative-contracts';

function narrative(partial: Partial<RecommendationCardNarrative>): RecommendationCardNarrative {
  return {
    whyImportant: 'why',
    whatItTeaches: 'teach',
    watchFor: ['a', 'b', 'c'],
    historicalContext: 'history',
    reception: {},
    castHighlights: [],
    streaming: [],
    spoilerPolicy: 'NO_SPOILERS',
    journeyNode: 'ENGINE_V1_CORE',
    nextStepHint: 'next',
    ratings: {
      imdb: { value: 7.2, scale: '10' },
      additional: [{ source: 'RT', value: 82, scale: '100' }],
    },
    ...partial,
  };
}

describe('computeCitationValidRateFromNarrative', () => {
  it('returns 1 when there are no references', () => {
    const rate = computeCitationValidRateFromNarrative(narrative({
      whyImportant: 'No citations here',
      whatItTeaches: 'Still valid',
    }), 2);
    expect(rate).toBe(1);
  });

  it('returns fraction of valid refs when mixed valid/invalid refs are present', () => {
    const rate = computeCitationValidRateFromNarrative(narrative({
      whyImportant: 'Grounded by [E1] and [E2]',
      whatItTeaches: 'Bad ref [E9]',
      historicalContext: 'repeat [E1]',
    }), 2);
    expect(rate).toBeCloseTo(2 / 3, 6);
  });
});

