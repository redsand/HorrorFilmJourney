import { describe, expect, it } from 'vitest';
import { mergeCreditsWithGuard } from '@/lib/tmdb/credits-guard';

describe('credits ingestion guard', () => {
  it('does not clear existing credits when incoming credits are empty', () => {
    const merged = mergeCreditsWithGuard({
      existingDirector: 'John Carpenter',
      existingCastTop: [
        { name: 'Kurt Russell', role: 'MacReady' },
        { name: 'Keith David', role: 'Childs' },
      ],
      incomingDirector: null,
      incomingCastTop: [],
    });

    expect(merged.director).toBe('John Carpenter');
    expect(merged.castTop).toEqual([
      { name: 'Kurt Russell', role: 'MacReady' },
      { name: 'Keith David', role: 'Childs' },
    ]);
  });

  it('uses incoming credits when they are present', () => {
    const merged = mergeCreditsWithGuard({
      existingDirector: 'John Carpenter',
      existingCastTop: [{ name: 'Kurt Russell', role: 'MacReady' }],
      incomingDirector: 'Ridley Scott',
      incomingCastTop: [{ name: 'Sigourney Weaver', role: 'Ripley' }],
    });

    expect(merged.director).toBe('Ridley Scott');
    expect(merged.castTop).toEqual([{ name: 'Sigourney Weaver', role: 'Ripley' }]);
  });
});

