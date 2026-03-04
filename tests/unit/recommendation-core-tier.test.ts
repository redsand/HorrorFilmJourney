import { describe, expect, it } from 'vitest';
import { prioritizeCoreThenExtended } from '@/lib/recommendation/core-tier';

describe('recommendation core tier prioritization', () => {
  it('defaults to core and only uses extended after core', () => {
    const ranked = prioritizeCoreThenExtended(
      ['core-1', 'core-2', 'core-3'],
      ['extended-1', 'extended-2'],
      4,
    );
    expect(ranked).toEqual(['core-1', 'core-2', 'core-3', 'extended-1']);
  });
});
