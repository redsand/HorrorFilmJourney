import { SEASON2_NODE_GOVERNANCE_CONFIG } from '../../../config/seasons/season2-node-governance';

export type Season2NodeGovernanceConfig = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
  defaults: {
    targetSize: number;
    minEligible: number;
    maxNodesPerMovie: number;
    maxYear: number;
    minCultScore: number;
    enforceBalance: boolean;
  };
  nodes: Record<string, {
    targetSize?: number;
    minEligible?: number;
  }>;
};

function clampIntMin(value: number, min: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.floor(value));
}

function parseIntEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolEnv(name: string): boolean | null {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === 'true' || raw === '1' || raw === 'yes') {
    return true;
  }
  if (raw === 'false' || raw === '0' || raw === 'no') {
    return false;
  }
  return null;
}

export async function loadSeason2NodeGovernanceConfig(): Promise<Season2NodeGovernanceConfig> {
  return SEASON2_NODE_GOVERNANCE_CONFIG;
}

export function applySeason2GovernanceEnvOverrides(
  config: Season2NodeGovernanceConfig,
): Season2NodeGovernanceConfig {
  const targetSizeOverride = parseIntEnv('SEASON2_NODE_SIZE');
  const minEligibleOverride = parseIntEnv('SEASON2_MIN_ELIGIBLE_PER_NODE');
  const maxNodesPerMovieOverride = parseIntEnv('SEASON2_MAX_NODES_PER_MOVIE');
  const maxYearOverride = parseIntEnv('SEASON2_MAX_YEAR');
  const minCultScoreOverride = parseIntEnv('SEASON2_CULT_SCORE_MIN');
  const enforceBalanceOverride = parseBoolEnv('SEASON2_ENFORCE_BALANCE');
  const taxonomyVersionOverride = process.env.SEASON2_TAXONOMY_VERSION?.trim();

  return {
    ...config,
    taxonomyVersion: taxonomyVersionOverride && taxonomyVersionOverride.length > 0
      ? taxonomyVersionOverride
      : config.taxonomyVersion,
    defaults: {
      targetSize: targetSizeOverride === null ? config.defaults.targetSize : clampIntMin(targetSizeOverride, 1),
      minEligible: minEligibleOverride === null ? config.defaults.minEligible : clampIntMin(minEligibleOverride, 1),
      maxNodesPerMovie: maxNodesPerMovieOverride === null
        ? config.defaults.maxNodesPerMovie
        : clampIntMin(maxNodesPerMovieOverride, 1),
      maxYear: maxYearOverride === null ? config.defaults.maxYear : clampIntMin(maxYearOverride, 1900),
      minCultScore: minCultScoreOverride === null ? config.defaults.minCultScore : clampIntMin(minCultScoreOverride, 0),
      enforceBalance: enforceBalanceOverride === null ? config.defaults.enforceBalance : enforceBalanceOverride,
    },
  };
}

export function resolveSeason2NodeTargetSize(config: Season2NodeGovernanceConfig, nodeSlug: string): number {
  return clampIntMin(config.nodes[nodeSlug]?.targetSize ?? config.defaults.targetSize, 1);
}

export function resolveSeason2NodeMinEligible(config: Season2NodeGovernanceConfig, nodeSlug: string): number {
  return clampIntMin(config.nodes[nodeSlug]?.minEligible ?? config.defaults.minEligible, 1);
}

