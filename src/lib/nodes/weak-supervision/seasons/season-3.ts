import type { SeasonWeakSupervisionPlugin } from './types';

// Season 3 starts ontology-first and remains deterministic. We keep plugin LFs
// empty until curated weak-supervision rules are explicitly versioned.
export const season3WeakSupervisionPlugin: SeasonWeakSupervisionPlugin = {
  seasonId: 'season-3',
  buildLabelingFunctions: () => [],
  defaultNodeThresholds: {},
  exclusivityRules: [],
};
