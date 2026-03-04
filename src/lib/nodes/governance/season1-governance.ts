import { SEASON1_NODE_GOVERNANCE_CONFIG } from '../../../config/seasons/season1-node-governance';

export type OverlapPenaltyRule = {
  a: string;
  b: string;
  penalty: number;
  reason?: string;
};

export type SeasonNodeGovernanceConfig = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
  defaults: {
    threshold: number;
    qualityFloor: number;
    coreThreshold: number;
    coreMinScoreAbsolute: number;
    corePickPercentile: number;
    coreMaxPerNode: number;
    targetSize: number;
    minEligible: number;
    maxNodesPerMovie: number;
    maxExtendedPerNode?: number | null;
  };
  nodes: Record<string, {
    threshold?: number;
    qualityFloor?: number;
    coreThreshold?: number;
    coreMinScoreAbsolute?: number;
    corePickPercentile?: number;
    coreMaxPerNode?: number;
    targetSize?: number;
    minEligible?: number;
    maxExtendedPerNode?: number | null;
  }>;
  overlapConstraints: {
    disallowedPairs: Array<[string, string]>;
    penalizedPairs: OverlapPenaltyRule[];
  };
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function parseIntEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatEnv(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseThresholdOverrides(nodeSlugs: string[]): Record<string, number> {
  const raw = process.env.SEASON1_NODE_THRESHOLDS_JSON?.trim();
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const slug of nodeSlugs) {
      const value = parsed[slug];
      if (typeof value === 'number') {
        out[slug] = clamp01(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function loadSeason1NodeGovernanceConfig(): Promise<SeasonNodeGovernanceConfig> {
  return SEASON1_NODE_GOVERNANCE_CONFIG;
}

export function resolvePerNodeThreshold(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.threshold ?? config.defaults.threshold;
}

export function resolvePerNodeQualityFloor(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.qualityFloor ?? config.defaults.qualityFloor;
}

export function resolvePerNodeCoreThreshold(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.coreThreshold ?? config.defaults.coreThreshold;
}

export function resolvePerNodeCoreMinScoreAbsolute(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.coreMinScoreAbsolute ?? config.defaults.coreMinScoreAbsolute;
}

export function resolvePerNodeCorePickPercentile(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.corePickPercentile ?? config.defaults.corePickPercentile;
}

export function resolvePerNodeCoreMaxPerNode(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.coreMaxPerNode ?? config.defaults.coreMaxPerNode;
}

export function resolvePerNodeTargetSize(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.targetSize ?? config.defaults.targetSize;
}

export function resolvePerNodeMinEligible(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.minEligible ?? config.defaults.minEligible;
}

export function resolvePerNodeMaxExtended(config: SeasonNodeGovernanceConfig, nodeSlug: string): number | null {
  const raw = config.nodes[nodeSlug]?.maxExtendedPerNode;
  if (typeof raw === 'number') {
    return Math.max(1, Math.floor(raw));
  }
  if (raw === null) {
    return null;
  }
  const fallback = config.defaults.maxExtendedPerNode;
  if (typeof fallback === 'number') {
    return Math.max(1, Math.floor(fallback));
  }
  return null;
}

export function applySeason1GovernanceEnvOverrides(config: SeasonNodeGovernanceConfig, nodeSlugs: string[]): SeasonNodeGovernanceConfig {
  const thresholdOverride = parseFloatEnv('SEASON1_DEFAULT_THRESHOLD');
  const qualityFloorOverride = parseFloatEnv('SEASON1_DEFAULT_QUALITY_FLOOR');
  const coreThresholdOverride = parseFloatEnv('SEASON1_DEFAULT_CORE_THRESHOLD');
  const coreMinAbsOverride = parseFloatEnv('SEASON1_CORE_MIN_SCORE_ABSOLUTE');
  const corePickPercentileOverride = parseFloatEnv('SEASON1_CORE_PICK_PERCENTILE');
  const coreMaxPerNodeOverride = parseIntEnv('SEASON1_CORE_MAX_PER_NODE');
  const targetOverride = parseIntEnv('SEASON1_TARGET_PER_NODE');
  const minOverride = parseIntEnv('SEASON1_MIN_ELIGIBLE_PER_NODE');
  const maxNodesOverride = parseIntEnv('SEASON1_MAX_NODES_PER_MOVIE');
  const maxExtendedOverride = parseIntEnv('SEASON1_MAX_EXTENDED_PER_NODE');
  const taxonomyVersionOverride = process.env.SEASON1_TAXONOMY_VERSION?.trim();

  const thresholdByNode = parseThresholdOverrides(nodeSlugs);

  return {
    ...config,
    taxonomyVersion: taxonomyVersionOverride && taxonomyVersionOverride.length > 0 ? taxonomyVersionOverride : config.taxonomyVersion,
    defaults: {
      threshold: thresholdOverride === null ? config.defaults.threshold : clamp01(thresholdOverride),
      qualityFloor: qualityFloorOverride === null ? config.defaults.qualityFloor : clamp01(qualityFloorOverride),
      coreThreshold: coreThresholdOverride === null ? config.defaults.coreThreshold : clamp01(coreThresholdOverride),
      coreMinScoreAbsolute: coreMinAbsOverride === null ? config.defaults.coreMinScoreAbsolute : clamp01(coreMinAbsOverride),
      corePickPercentile: corePickPercentileOverride === null ? config.defaults.corePickPercentile : clamp01(corePickPercentileOverride),
      coreMaxPerNode: coreMaxPerNodeOverride === null ? config.defaults.coreMaxPerNode : Math.max(1, coreMaxPerNodeOverride),
      targetSize: targetOverride === null ? config.defaults.targetSize : Math.max(1, targetOverride),
      minEligible: minOverride === null ? config.defaults.minEligible : Math.max(1, minOverride),
      maxNodesPerMovie: maxNodesOverride === null ? config.defaults.maxNodesPerMovie : Math.max(1, maxNodesOverride),
      maxExtendedPerNode: maxExtendedOverride === null ? config.defaults.maxExtendedPerNode : Math.max(1, maxExtendedOverride),
    },
    nodes: Object.fromEntries(
      Object.entries(config.nodes).map(([slug, node]) => {
        const threshold = thresholdByNode[slug];
        return [
          slug,
          {
            ...node,
            ...(typeof threshold === 'number' ? { threshold } : {}),
          },
        ];
      }),
    ),
  };
}

export function toPairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}
