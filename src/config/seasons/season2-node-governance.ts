import type { Season2NodeGovernanceConfig } from '@/lib/nodes/governance/season2-governance';

export const SEASON2_NODE_GOVERNANCE_CONFIG: Season2NodeGovernanceConfig = {
  seasonSlug: 'season-2',
  packSlug: 'cult-classics',
  taxonomyVersion: 'season-2-cult-v3',
  defaults: {
    targetSize: 56,
    minEligible: 24,
    maxNodesPerMovie: 1,
    maxYear: 2010,
    minCultScore: 4,
    enforceBalance: false,
  },
  nodes: {
    'origins-of-cult-cinema': {},
    'midnight-movies': {},
    'grindhouse-exploitation': {},
    eurocult: {},
    'psychotronic-cinema': {},
    'cult-horror': {},
    'cult-science-fiction': {},
    'outsider-cinema': {},
    'camp-cult-comedy': {},
    'video-store-era': {},
    'modern-cult-phenomena': {},
  },
};
