import { describe, expect, it } from 'vitest';
import {
  buildSeason1LabelingFunctions,
  inferNodeProbabilities,
  type WeakSupervisionMovie,
} from '@/lib/nodes/weak-supervision';

describe('weak supervision labeling functions', () => {
  it('are deterministic for repeated calls', () => {
    const movie: WeakSupervisionMovie = {
      id: 'm1',
      tmdbId: 100,
      title: 'The Ritual',
      year: 2017,
      genres: ['horror', 'folk-horror', 'ritual', 'occult', 'survival-horror'],
    };

    const lfs = buildSeason1LabelingFunctions();
    const first = inferNodeProbabilities(movie, ['folk-horror', 'slasher-serial-killer'], lfs);
    const second = inferNodeProbabilities(movie, ['folk-horror', 'slasher-serial-killer'], lfs);

    expect(second).toEqual(first);
    expect(first.find((entry) => entry.nodeSlug === 'folk-horror')?.probability ?? 0).toBeGreaterThan(0.6);
  });
});
