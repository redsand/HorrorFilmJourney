import { describe, expect, it } from 'vitest';
import { buildWatchReason } from '@/lib/journey/watch-reason';

describe('buildWatchReason', () => {
  it('uses curated watchReason when provided', () => {
    const reason = buildWatchReason({
      seasonSlug: 'season-2',
      nodeSlug: 'midnight-movies',
      movieMeta: {
        title: 'Eraserhead',
        year: 1977,
        country: 'US',
        director: 'David Lynch',
      },
      nodeMeta: {
        name: 'Midnight Movies',
        whatToNotice: ['Counterculture ritual screenings'],
        subgenres: ['midnight'],
      },
      curatedWatchReason: 'Cult touchstone of midnight surrealism and fan ritual.',
    });

    expect(reason).toBe('Cult touchstone of midnight surrealism and fan ritual.');
    expect(reason.length).toBeLessThanOrEqual(140);
  });

  it('generates deterministic one-liner from node + stable facts when curated reason is missing (Season 1)', () => {
    const reason = buildWatchReason({
      seasonSlug: 'season-1',
      nodeSlug: 'supernatural-horror',
      movieMeta: {
        title: 'The Exorcist',
        year: 1973,
        country: 'US',
        director: 'William Friedkin',
      },
      nodeMeta: {
        name: 'Supernatural Horror',
        whatToNotice: ['Faith vs skepticism and possession escalation'],
        subgenres: ['possession', 'occult'],
      },
    });

    expect(reason).toContain('Supernatural Horror');
    expect(reason).toContain('1973');
    expect(reason.length).toBeLessThanOrEqual(140);
  });

  it('generates deterministic one-liner from node + stable facts when curated reason is missing (Season 2)', () => {
    const reason = buildWatchReason({
      seasonSlug: 'season-2',
      nodeSlug: 'psychotronic-cinema',
      movieMeta: {
        title: 'Tetsuo: The Iron Man',
        year: 1989,
        country: 'Japan',
        director: null,
      },
      nodeMeta: {
        name: 'Psychotronic Cinema',
        whatToNotice: ['Transgressive texture and underground energy'],
        subgenres: ['punk body horror', 'industrial cult'],
      },
    });

    expect(reason).toContain('Psychotronic Cinema');
    expect(reason).toContain('1989');
    expect(reason.length).toBeLessThanOrEqual(140);
  });
});
