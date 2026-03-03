import { describe, expect, it } from 'vitest';
import { InteractionStatus } from '@prisma/client';
import { normalizeInteractionSignal } from '@/lib/recommendation/recommendation-engine';

describe('normalizeInteractionSignal emotion mapping', () => {
  it('treats bored/slow/dull as negative and reduces signal', () => {
    const base = normalizeInteractionSignal({
      status: InteractionStatus.WATCHED,
      rating: 3,
      recommend: null,
      recencyWeight: 1,
      emotions: [],
    });
    const negative = normalizeInteractionSignal({
      status: InteractionStatus.WATCHED,
      rating: 3,
      recommend: null,
      recencyWeight: 1,
      emotions: ['bored', 'slow', 'dull'],
    });
    expect(negative).toBeLessThan(base);
  });

  it('keeps positive emotions above equivalent negative input', () => {
    const positive = normalizeInteractionSignal({
      status: InteractionStatus.WATCHED,
      rating: 3,
      recommend: null,
      recencyWeight: 1,
      emotions: ['fun', 'tense'],
    });
    const negative = normalizeInteractionSignal({
      status: InteractionStatus.WATCHED,
      rating: 3,
      recommend: null,
      recencyWeight: 1,
      emotions: ['bored', 'dull'],
    });
    expect(positive).toBeGreaterThan(negative);
  });
});

