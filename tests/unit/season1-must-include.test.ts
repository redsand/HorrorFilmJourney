import { describe, expect, it } from 'vitest';
import {
  getSeason1MustIncludeForNode,
  SEASON1_MUST_INCLUDE_ANCHORS,
} from '@/config/seasons/season1-must-include';

describe('season1 must-include anchors', () => {
  it('keeps an essentials list sized for curation (30-100)', () => {
    expect(SEASON1_MUST_INCLUDE_ANCHORS.length).toBeGreaterThanOrEqual(30);
    expect(SEASON1_MUST_INCLUDE_ANCHORS.length).toBeLessThanOrEqual(100);
  });

  it('includes key omission targets', () => {
    const social = getSeason1MustIncludeForNode('social-domestic-horror');
    expect(social.some((entry) => entry.title === 'Get Out' && entry.year === 2017)).toBe(true);

    const slasher = getSeason1MustIncludeForNode('slasher-serial-killer');
    expect(slasher.some((entry) => entry.title === 'Scream VI' && entry.year === 2023)).toBe(true);

    const supernatural = getSeason1MustIncludeForNode('supernatural-horror');
    expect(supernatural.some((entry) => entry.title === 'The Conjuring 2' && entry.year === 2016)).toBe(true);

    const survival = getSeason1MustIncludeForNode('survival-horror');
    expect(survival.some((entry) => entry.title === '28 Years Later' && entry.year === 2025)).toBe(true);

    const splatter = getSeason1MustIncludeForNode('splatter-extreme');
    expect(splatter.some((entry) => entry.title === 'Final Destination Bloodlines' && entry.year === 2025)).toBe(true);
  });
});
