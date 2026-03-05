import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSeasonOntology } from '@/lib/ontology/loadSeasonOntology';
import { TMDB_GENRE, getSeason3SciFiDiscoverPlans } from '@/lib/seasons/season3/sci-fi-discovery-profile';

type GovernanceFile = {
  overlapConstraints?: {
    disallowedPairs?: string[][];
    penalizedPairs?: string[][];
  };
};

type AnchorFile = {
  anchors?: Array<{
    tmdbId?: number;
    title?: string;
    year?: number;
    nodeSlug?: string;
    tier?: string;
  }>;
};

function readJson<T>(targetPath: string): T {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8')) as T;
}

describe('season-3 taxonomy contract', () => {
  it('loads season-3 ontology into runtime registry', () => {
    const ontology = loadSeasonOntology('season-3');
    expect(ontology.seasonId).toBe('season-3');
    expect(ontology.nodes.length).toBeGreaterThanOrEqual(16);
  });

  it('defines overlap constraints for known collision-prone node pairs', () => {
    const governancePath = path.resolve('docs', 'season', 'season-3-sci-fi-node-governance.json');
    const governance = readJson<GovernanceFile>(governancePath);
    const disallowedPairs = governance.overlapConstraints?.disallowedPairs ?? [];
    const penalizedPairs = governance.overlapConstraints?.penalizedPairs ?? [];

    expect(disallowedPairs.length + penalizedPairs.length).toBeGreaterThan(0);
    expect(
      penalizedPairs.some(
        (pair) => pair.includes('dystopian-science-fiction') && pair.includes('post-apocalyptic-science-fiction'),
      ),
    ).toBe(true);
    expect(
      penalizedPairs.some(
        (pair) => pair.includes('artificial-intelligence-robotics') && pair.includes('cyberpunk'),
      ),
    ).toBe(true);
  });

  it('requires explicit sci-fi genre signal in every discover plan', () => {
    const plans = getSeason3SciFiDiscoverPlans();
    expect(plans.length).toBeGreaterThanOrEqual(5);
    for (const plan of plans) {
      expect(plan.withGenres).toContain(TMDB_GENRE.SCIENCE_FICTION);
    }
  });

  it('defines non-empty anchor set for season-3 sci-fi', () => {
    const anchorsPath = path.resolve('docs', 'season', 'season-3-sci-fi-anchors.json');
    const anchors = readJson<AnchorFile>(anchorsPath);
    const entries = anchors.anchors ?? [];

    expect(entries.length).toBeGreaterThanOrEqual(16);
    for (const entry of entries) {
      expect(typeof entry.tmdbId).toBe('number');
      expect(typeof entry.title).toBe('string');
      expect(typeof entry.year).toBe('number');
      expect(typeof entry.nodeSlug).toBe('string');
      expect(entry.tier).toBe('CORE');
    }
  });
});
