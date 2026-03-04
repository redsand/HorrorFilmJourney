import type { SeasonOntology } from '@/lib/ontology/types';
import type { LabelingFunction, NodeExclusivityRule } from '../types';

export type BuildSeasonPluginLfInput = {
  ontology: SeasonOntology;
  taxonomyVersion?: string;
  allowedNodeSlugs?: Set<string>;
};

export type SeasonWeakSupervisionPlugin = {
  seasonId: string;
  buildLabelingFunctions: (input: BuildSeasonPluginLfInput) => LabelingFunction[];
  defaultNodeThresholds?: Record<string, number>;
  exclusivityRules?: NodeExclusivityRule[];
};

