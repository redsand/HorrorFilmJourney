import { describe, expect, it } from 'vitest';
import { loadSeasonOntology } from '@/lib/ontology/loadSeasonOntology';
import { SEASON_1_HORROR_CLASSICS_ONTOLOGY } from '@/ontology/seasons/season-1-horror-classics';
import { SEASON1_NODE_GOVERNANCE_CONFIG } from '@/config/seasons/season1-node-governance';

describe('Season 1 horror ontology', () => {
  it('loader returns the Season 1 ontology', () => {
    const ontology = loadSeasonOntology('season-1');

    expect(ontology).toEqual(SEASON_1_HORROR_CLASSICS_ONTOLOGY);
    expect(ontology.seasonId).toBe('season-1');
    expect(ontology.seasonSlug).toBe('horror-classics');
    expect(ontology.nodes).toHaveLength(16);
  });

  it('node slugs match current JourneyNode slugs', () => {
    const ontology = loadSeasonOntology('season-1');
    const ontologySlugs = ontology.nodes.map((node) => node.slug).sort();
    const journeyNodeSlugs = Object.keys(SEASON1_NODE_GOVERNANCE_CONFIG.nodes).sort();

    expect(ontologySlugs).toEqual(journeyNodeSlugs);
  });

  it('has no duplicate node slugs', () => {
    const ontology = loadSeasonOntology('season-1');
    const slugs = ontology.nodes.map((node) => node.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

