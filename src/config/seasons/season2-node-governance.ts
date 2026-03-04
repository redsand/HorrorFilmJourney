import type { Season2NodeGovernanceConfig } from '@/lib/nodes/governance/season2-governance';

export const SEASON2_NODE_GOVERNANCE_CONFIG: Season2NodeGovernanceConfig = {
  seasonSlug: 'season-2',
  packSlug: 'cult-classics',
  taxonomyVersion: 'season-2-cult-v1',
  defaults: {
    targetSize: 64,
    minEligible: 30,
    maxNodesPerMovie: 1,
    maxYear: 2010,
    minCultScore: 4,
    enforceBalance: false,
  },
  nodes: {
    'birth-of-midnight': {},
    'grindhouse-exploitation': {},
    'so-bad-its-good': {},
    'cult-sci-fi-fantasy': {},
    'punk-counterculture': {},
    'vhs-video-store-era': {},
    'cult-comedy-absurdism': {},
    'modern-cult-phenomena': {},
  },
};

