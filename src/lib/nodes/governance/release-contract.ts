import { SEASON1_NODE_GOVERNANCE_CONFIG } from '../../../config/seasons/season1-node-governance.ts';
import { SEASON2_NODE_GOVERNANCE_CONFIG } from '../../../config/seasons/season2-node-governance.ts';

export type ReleaseContract = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
};

const CONTRACTS: ReleaseContract[] = [
  {
    seasonSlug: SEASON1_NODE_GOVERNANCE_CONFIG.seasonSlug,
    packSlug: SEASON1_NODE_GOVERNANCE_CONFIG.packSlug,
    taxonomyVersion: SEASON1_NODE_GOVERNANCE_CONFIG.taxonomyVersion,
  },
  {
    seasonSlug: SEASON2_NODE_GOVERNANCE_CONFIG.seasonSlug,
    packSlug: SEASON2_NODE_GOVERNANCE_CONFIG.packSlug,
    taxonomyVersion: SEASON2_NODE_GOVERNANCE_CONFIG.taxonomyVersion,
  },
];

export function getReleaseContract(params: { seasonSlug?: string; packSlug?: string }): ReleaseContract {
  const match = CONTRACTS.find((contract) => {
    if (params.seasonSlug && params.seasonSlug !== contract.seasonSlug) {
      return false;
    }
    if (params.packSlug && params.packSlug !== contract.packSlug) {
      return false;
    }
    return true;
  });
  if (!match) {
    throw new Error(
      `No release contract defined for season=${params.seasonSlug ?? 'unknown'} pack=${params.packSlug ?? 'unknown'}`,
    );
  }
  return match;
}

export function getReleaseContracts(): ReleaseContract[] {
  return [...CONTRACTS];
}

export function assertCanonicalTaxonomyVersion(contract: ReleaseContract, taxonomyVersion: string): void {
  if (taxonomyVersion !== contract.taxonomyVersion) {
    throw new Error(
      `Release taxonomyVersion mismatch for ${contract.seasonSlug}/${contract.packSlug}: expected ${contract.taxonomyVersion}, got ${taxonomyVersion}`,
    );
  }
}
