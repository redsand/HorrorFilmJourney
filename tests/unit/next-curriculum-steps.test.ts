import { describe, expect, it } from 'vitest';
import { __nextCurriculumTestUtils } from '@/lib/journey/get-next-curriculum-steps';

const artifacts = {
  confidenceByKey: new Map<string, number>(),
  canonByKey: new Map<string, number>(),
};

function key(title: string, year: number) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${year}`;
}

describe('getNextCurriculumSteps selection', () => {
  it('returns next core in same Season 1 node', () => {
    const result = __nextCurriculumTestUtils.selectNextSteps({
      seasonSlug: 'season-1',
      currentTmdbId: 100,
      currentNodeSlug: 'supernatural-horror',
      currentNodeName: 'Supernatural Horror',
      nodes: [{ slug: 'supernatural-horror', name: 'Supernatural Horror', order: 1 }],
      watchedTmdbIds: new Set<number>(),
      artifacts,
      rows: [
        {
          tmdbId: 100,
          title: 'Film A',
          year: 1973,
          nodeSlug: 'supernatural-horror',
          nodeName: 'Supernatural Horror',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 1,
          rank: 1,
          finalScore: 0.9,
          journeyScore: 0.8,
          evidence: null,
        },
        {
          tmdbId: 101,
          title: 'Film B',
          year: 1978,
          nodeSlug: 'supernatural-horror',
          nodeName: 'Supernatural Horror',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 2,
          rank: 2,
          finalScore: 0.88,
          journeyScore: 0.79,
          evidence: null,
        },
        {
          tmdbId: 102,
          title: 'Film C',
          year: 1981,
          nodeSlug: 'supernatural-horror',
          nodeName: 'Supernatural Horror',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 3,
          rank: 3,
          finalScore: 0.86,
          journeyScore: 0.77,
          evidence: null,
        },
      ],
    });

    expect(result.nextCore.map((f) => f.tmdbId)).toEqual([101, 102]);
    expect(result.reason).toContain('Next core film in Supernatural Horror');
  });

  it('orders Season 2 next core by canon rank before confidence', () => {
    const season2Artifacts = {
      confidenceByKey: new Map<string, number>([
        [key('Canon Candidate', 1990), 70],
        [key('High Confidence', 1987), 90],
        [key('Mid Confidence', 1989), 80],
      ]),
      canonByKey: new Map<string, number>([
        [key('Current Cult', 1985), 1],
        [key('Canon Candidate', 1990), 5],
      ]),
    };

    const result = __nextCurriculumTestUtils.selectNextSteps({
      seasonSlug: 'season-2',
      currentTmdbId: 200,
      currentNodeSlug: 'midnight-movies',
      currentNodeName: 'Midnight Movies',
      nodes: [{ slug: 'midnight-movies', name: 'Midnight Movies', order: 1 }],
      watchedTmdbIds: new Set<number>(),
      artifacts: season2Artifacts,
      rows: [
        {
          tmdbId: 200,
          title: 'Current Cult',
          year: 1985,
          nodeSlug: 'midnight-movies',
          nodeName: 'Midnight Movies',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 1,
          rank: 1,
          finalScore: 0.9,
          journeyScore: 0.8,
          evidence: null,
        },
        {
          tmdbId: 201,
          title: 'Canon Candidate',
          year: 1990,
          nodeSlug: 'midnight-movies',
          nodeName: 'Midnight Movies',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 2,
          rank: 2,
          finalScore: 0.9,
          journeyScore: 0.8,
          evidence: null,
        },
        {
          tmdbId: 202,
          title: 'High Confidence',
          year: 1987,
          nodeSlug: 'midnight-movies',
          nodeName: 'Midnight Movies',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 3,
          rank: 3,
          finalScore: 0.9,
          journeyScore: 0.8,
          evidence: null,
        },
        {
          tmdbId: 203,
          title: 'Mid Confidence',
          year: 1989,
          nodeSlug: 'midnight-movies',
          nodeName: 'Midnight Movies',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 4,
          rank: 4,
          finalScore: 0.9,
          journeyScore: 0.8,
          evidence: null,
        },
      ],
    });

    expect(result.nextCore.map((f) => f.tmdbId)).toEqual([201, 202, 203]);
  });

  it('switches to next node when current node core is complete', () => {
    const result = __nextCurriculumTestUtils.selectNextSteps({
      seasonSlug: 'season-1',
      currentTmdbId: 300,
      currentNodeSlug: 'node-a',
      currentNodeName: 'Node A',
      nodes: [
        { slug: 'node-a', name: 'Node A', order: 1 },
        { slug: 'node-b', name: 'Node B', order: 2 },
      ],
      watchedTmdbIds: new Set<number>([300, 301]),
      artifacts,
      rows: [
        {
          tmdbId: 300,
          title: 'A1',
          year: 1970,
          nodeSlug: 'node-a',
          nodeName: 'Node A',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 1,
          rank: 1,
          finalScore: 0.8,
          journeyScore: 0.8,
          evidence: null,
        },
        {
          tmdbId: 301,
          title: 'A2',
          year: 1971,
          nodeSlug: 'node-a',
          nodeName: 'Node A',
          nodeOrder: 1,
          tier: 'CORE',
          coreRank: 2,
          rank: 2,
          finalScore: 0.79,
          journeyScore: 0.79,
          evidence: null,
        },
        {
          tmdbId: 302,
          title: 'A-Deep',
          year: 1972,
          nodeSlug: 'node-a',
          nodeName: 'Node A',
          nodeOrder: 1,
          tier: 'EXTENDED',
          coreRank: null,
          rank: 1,
          finalScore: 0.77,
          journeyScore: 0.77,
          evidence: null,
        },
        {
          tmdbId: 310,
          title: 'B1',
          year: 1980,
          nodeSlug: 'node-b',
          nodeName: 'Node B',
          nodeOrder: 2,
          tier: 'CORE',
          coreRank: 1,
          rank: 1,
          finalScore: 0.91,
          journeyScore: 0.9,
          evidence: null,
        },
      ],
    });

    expect(result.reason).toContain('continue with Node B');
    expect(result.nextCore.map((f) => f.tmdbId)).toEqual([310]);
    expect(result.nextExtended.map((f) => f.tmdbId)).toEqual([302]);
  });
});
