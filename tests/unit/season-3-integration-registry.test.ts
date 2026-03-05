import { describe, expect, it } from 'vitest';
import { loadSeasonOntology } from '@/lib/ontology/loadSeasonOntology';
import { getSeasonWeakSupervisionPlugin } from '@/lib/nodes/weak-supervision/seasons';
import { loadSeasonJourneyWorthinessConfig } from '@/config/seasons/journey-worthiness';

describe('season-3 integration registry', () => {
  it('loads season-3 ontology from runtime registry', () => {
    const ontology = loadSeasonOntology('season-3');
    expect(ontology.seasonId).toBe('season-3');
    expect(ontology.taxonomyVersion).toBe('season-3-sci-fi-v1');
    expect(ontology.nodes.length).toBeGreaterThanOrEqual(16);
  });

  it('registers a season-3 weak supervision plugin and journey config', () => {
    const plugin = getSeasonWeakSupervisionPlugin('season-3');
    const journeyConfig = loadSeasonJourneyWorthinessConfig('season-3');

    expect(plugin).not.toBeNull();
    expect(journeyConfig.gates?.journeyMinCore).toBeLessThanOrEqual(0.6);
  });
});
