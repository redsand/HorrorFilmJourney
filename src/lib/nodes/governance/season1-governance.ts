import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
    targetSize: number;
    minEligible: number;
    maxNodesPerMovie: number;
  };
  nodes: Record<string, {
    threshold?: number;
    targetSize?: number;
    minEligible?: number;
  }>;
  overlapConstraints: {
    disallowedPairs: Array<[string, string]>;
    penalizedPairs: OverlapPenaltyRule[];
  };
};

const GOVERNANCE_PATH = resolve('docs/season/season-1-node-governance.json');

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
  const raw = await readFile(GOVERNANCE_PATH, 'utf8');
  return JSON.parse(raw) as SeasonNodeGovernanceConfig;
}

export function resolvePerNodeThreshold(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.threshold ?? config.defaults.threshold;
}

export function resolvePerNodeTargetSize(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.targetSize ?? config.defaults.targetSize;
}

export function resolvePerNodeMinEligible(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.minEligible ?? config.defaults.minEligible;
}

export function applySeason1GovernanceEnvOverrides(config: SeasonNodeGovernanceConfig, nodeSlugs: string[]): SeasonNodeGovernanceConfig {
  const thresholdOverride = parseFloatEnv('SEASON1_DEFAULT_THRESHOLD');
  const targetOverride = parseIntEnv('SEASON1_TARGET_PER_NODE');
  const minOverride = parseIntEnv('SEASON1_MIN_ELIGIBLE_PER_NODE');
  const maxNodesOverride = parseIntEnv('SEASON1_MAX_NODES_PER_MOVIE');
  const taxonomyVersionOverride = process.env.SEASON1_TAXONOMY_VERSION?.trim();

  const thresholdByNode = parseThresholdOverrides(nodeSlugs);

  return {
    ...config,
    taxonomyVersion: taxonomyVersionOverride && taxonomyVersionOverride.length > 0 ? taxonomyVersionOverride : config.taxonomyVersion,
    defaults: {
      threshold: thresholdOverride === null ? config.defaults.threshold : clamp01(thresholdOverride),
      targetSize: targetOverride === null ? config.defaults.targetSize : Math.max(1, targetOverride),
      minEligible: minOverride === null ? config.defaults.minEligible : Math.max(1, minOverride),
      maxNodesPerMovie: maxNodesOverride === null ? config.defaults.maxNodesPerMovie : Math.max(1, maxNodesOverride),
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
