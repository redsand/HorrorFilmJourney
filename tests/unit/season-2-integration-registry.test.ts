import { describe, expect, it } from 'vitest';
import { loadSeasonOntology } from '@/lib/ontology/loadSeasonOntology';
import { loadSeasonPrototypePack } from '@/lib/ontology/loadSeasonPrototypePack';
import { getSeasonWeakSupervisionPlugin } from '@/lib/nodes/weak-supervision/seasons';
import { loadSeasonJourneyWorthinessConfig } from '@/config/seasons/journey-worthiness';

describe('season-2 integration registry', () => {
  it('loads season-2 ontology and prototype pack', () => {
    const ontology = loadSeasonOntology('season-2');
    const prototypePack = loadSeasonPrototypePack('season-2', ontology.taxonomyVersion);

    expect(ontology.seasonId).toBe('season-2');
    expect(ontology.nodes).toHaveLength(11);
    expect(prototypePack.seasonId).toBe('season-2');
    expect(prototypePack.taxonomyVersion).toBe(ontology.taxonomyVersion);
    expect(prototypePack.nodes).toHaveLength(8);
  });

  it('registers a season-2 weak supervision plugin and journey config', () => {
    const plugin = getSeasonWeakSupervisionPlugin('season-2');
    const journeyConfig = loadSeasonJourneyWorthinessConfig('season-2');

    expect(plugin).not.toBeNull();
    expect(journeyConfig.gates?.journeyMinCore).toBeLessThanOrEqual(0.6);
  });
});
