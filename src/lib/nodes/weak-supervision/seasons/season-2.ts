import type { SeasonWeakSupervisionPlugin } from './types';

// Season 2 is curated/list-driven. We intentionally keep plugin-provided LFs
// empty so catalog expansion does not override the curated curriculum.
export const season2WeakSupervisionPlugin: SeasonWeakSupervisionPlugin = {
  seasonId: 'season-2',
  buildLabelingFunctions: () => [],
  defaultNodeThresholds: {},
  exclusivityRules: [],
};

