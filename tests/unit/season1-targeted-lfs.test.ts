import { describe, expect, it } from 'vitest';
import { buildSeason1LabelingFunctions } from '@/lib/nodes/weak-supervision';
import type { WeakSupervisionMovie } from '@/lib/nodes/weak-supervision/types';

function fireLfNames(nodeSlug: string, movie: WeakSupervisionMovie): string[] {
  const lfs = buildSeason1LabelingFunctions([nodeSlug]);
  return lfs
    .filter((lf) => lf.nodeSlug === nodeSlug)
    .map((lf) => ({ name: lf.name, result: lf.apply(movie) }))
    .filter((entry) => entry.result.label === 1)
    .map((entry) => entry.name);
}

describe('season1 targeted omission LFs', () => {
  it('fires social-horror targeted pattern for Get Out-like metadata', () => {
    const names = fireLfNames('social-domestic-horror', {
      id: 'm1',
      title: 'Get Out',
      year: 2017,
      genres: ['horror', 'thriller'],
      keywords: ['social thriller', 'racial paranoia'],
      synopsis: 'A social thriller about class pressure and suburban dread.',
    });
    expect(names.some((name) => name.includes('targeted.get-out-social-thriller'))).toBe(true);
  });

  it('fires scream franchise targeted pattern for slasher metadata', () => {
    const names = fireLfNames('slasher-serial-killer', {
      id: 'm2',
      title: 'Scream VI',
      year: 2023,
      genres: ['horror', 'thriller'],
      keywords: ['ghostface', 'final girl', 'slasher'],
      synopsis: 'A masked killer targets survivors.',
    });
    expect(names.some((name) => name.includes('targeted.scream-franchise'))).toBe(true);
  });

  it('fires cosmic-horror targeted patterns for eldritch metadata', () => {
    const names = fireLfNames('cosmic-horror', {
      id: 'm3',
      title: 'The Endless Void',
      year: 2017,
      genres: ['horror', 'sci-fi'],
      keywords: ['eldritch', 'ancient god', 'forbidden knowledge'],
      synopsis: 'Reality collapse triggered by an incomprehensible otherworldly entity.',
    });
    expect(names.some((name) => name.includes('targeted.eldritch-unknown'))).toBe(true);
  });

  it('fires horror-comedy targeted patterns for zom-com metadata', () => {
    const names = fireLfNames('horror-comedy', {
      id: 'm4',
      title: 'Camp of the Dead',
      year: 2020,
      genres: ['horror', 'comedy'],
      keywords: ['zom-com', 'parody', 'dark comedy'],
      synopsis: 'A deadpan absurd meta-horror satire with comedic gore.',
    });
    expect(names.some((name) => name.includes('targeted.zom-com-meta'))).toBe(true);
  });

  it('fires experimental-horror targeted patterns for surreal structure metadata', () => {
    const names = fireLfNames('experimental-horror', {
      id: 'm5',
      title: 'Fragmented Dreams',
      year: 2021,
      genres: ['horror'],
      keywords: ['avant-garde', 'nonlinear', 'abstract'],
      synopsis: 'A surreal fragmented narrative with dream logic and symbolic imagery.',
    });
    expect(names.some((name) => name.includes('targeted.formal-disruption'))).toBe(true);
  });

  it('fires survival-horror targeted patterns for 28-years outbreak metadata', () => {
    const names = fireLfNames('survival-horror', {
      id: 'm6',
      title: '28 Years Later',
      year: 2025,
      genres: ['horror', 'thriller', 'sci-fi'],
      keywords: ['infected', 'outbreak', 'quarantine'],
      synopsis: 'A siege survival story in a collapsed infected zone.',
    });
    expect(names.some((name) => name.includes('targeted.outbreak-siege'))).toBe(true);
  });

  it('fires supernatural targeted pattern for Silent Hill/Constantine style metadata', () => {
    const names = fireLfNames('supernatural-horror', {
      id: 'm7',
      title: 'Return to Silent Hill',
      year: 2026,
      genres: ['horror', 'mystery'],
      keywords: ['cursed town', 'demonic', 'occult investigator'],
      synopsis: 'A demonic curse spreads through a haunted town.',
    });
    expect(names.some((name) => name.includes('targeted.curse-and-hellgate'))).toBe(true);
  });
});
