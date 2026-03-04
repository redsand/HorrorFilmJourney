import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateGoldSample,
  scoreMovieForNode,
  type GoldFixture,
} from '@/lib/audit/season1-node-audit';

type TaxonomySpec = {
  nodes: Array<{ slug: string }>;
};

describe('season1 node audit fixture', () => {
  it('covers all 16 taxonomy nodes with a bounded sample set', () => {
    const taxonomy = JSON.parse(
      readFileSync(resolve('docs/season/season-1-horror-subgenre-curriculum.json'), 'utf8'),
    ) as TaxonomySpec;
    const fixture = JSON.parse(
      readFileSync(resolve('tests/fixtures/season1-node-gold.json'), 'utf8'),
    ) as GoldFixture;

    expect(fixture.samples.length).toBeGreaterThanOrEqual(20);
    expect(fixture.samples.length).toBeLessThanOrEqual(40);

    const expectedNodeSet = new Set(taxonomy.nodes.map((node) => node.slug));
    expect(expectedNodeSet.size).toBe(16);

    const coveredNodeSet = new Set(
      fixture.samples.flatMap((sample) => sample.expectedNodes),
    );

    for (const slug of expectedNodeSet) {
      expect(coveredNodeSet.has(slug), `fixture missing node: ${slug}`).toBe(true);
    }
  });

  it('computes fixture overlap and missing/unexpected nodes deterministically', () => {
    const result = evaluateGoldSample(
      ['psychological-horror', 'social-domestic-horror'],
      ['psychological-horror', 'splatter-extreme'],
    );

    expect(result.matched).toBe(true);
    expect(result.overlap).toEqual(['psychological-horror']);
    expect(result.missingExpected).toEqual(['social-domestic-horror']);
    expect(result.unexpectedAssigned).toEqual(['splatter-extreme']);
  });

  it('scores slasher signals above threshold when slasher tags are present', () => {
    const evidence = scoreMovieForNode('slasher-serial-killer', {
      id: 'movie-1',
      title: 'Halloween',
      year: 1978,
      genres: ['horror', 'slasher', 'stalker'],
    });

    expect(evidence.passed).toBe(true);
    expect(Number.isFinite(evidence.score)).toBe(true);
    expect(evidence.strongHits.length).toBeGreaterThan(0);
  });
});
