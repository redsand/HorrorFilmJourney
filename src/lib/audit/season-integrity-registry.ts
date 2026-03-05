import fs from 'node:fs/promises';
import path from 'node:path';

export type SeasonSnapshotFormat = 'assignment-list' | 'mastered-nodes';

export type SeasonIntegritySpec = {
  seasonSlug: string;
  packSlug: string;
  seasonName: string;
  packName: string;
  taxonomyVersion: string;
  snapshotFormat: SeasonSnapshotFormat;
  snapshotPath: string;
  anchorPath: string;
  fallbackPath: string;
  governancePath: string | null;
  configPath: string | null;
};

type SeasonIntegrityRegistryFile = {
  seasons: SeasonIntegritySpec[];
};

export type AuthoritySnapshotEntry = {
  seasonSlug: string;
  packSlug: string;
  nodeSlug: string;
  tmdbId: number;
  tier: 'CORE' | 'EXTENDED';
  title?: string;
  year?: number;
};

const REGISTRY_PATH = path.resolve('docs', 'season', 'season-integrity-registry.json');

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/^\uFEFF/, '')) as T;
}

function normalizePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

export async function loadSeasonIntegrityRegistry(): Promise<SeasonIntegritySpec[]> {
  const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
  const parsed = parseJson<SeasonIntegrityRegistryFile>(raw);
  if (!Array.isArray(parsed.seasons) || parsed.seasons.length === 0) {
    throw new Error('Season integrity registry is empty.');
  }
  return parsed.seasons;
}

export async function readAuthoritySnapshot(spec: SeasonIntegritySpec): Promise<AuthoritySnapshotEntry[]> {
  const snapshotRaw = await fs.readFile(normalizePath(spec.snapshotPath), 'utf8');
  if (spec.snapshotFormat === 'assignment-list') {
    const parsed = parseJson<{
      assignments?: Array<{
        nodeSlug?: string;
        tmdbId?: number | null;
        tier?: 'CORE' | 'EXTENDED';
        evidence?: { matchTitle?: string; matchYear?: number };
      }>;
    }>(snapshotRaw);
    const entries: AuthoritySnapshotEntry[] = [];
    for (const assignment of parsed.assignments ?? []) {
      if (typeof assignment.tmdbId !== 'number' || typeof assignment.nodeSlug !== 'string') {
        continue;
      }
      entries.push({
        seasonSlug: spec.seasonSlug,
        packSlug: spec.packSlug,
        nodeSlug: assignment.nodeSlug,
        tmdbId: assignment.tmdbId,
        tier: assignment.tier === 'EXTENDED' ? 'EXTENDED' : 'CORE',
        title: assignment.evidence?.matchTitle,
        year: assignment.evidence?.matchYear,
      });
    }
    return entries;
  }

  const parsed = parseJson<{
    nodes?: Array<{
      slug?: string;
      core?: Array<{ tmdbId?: number | null; title?: string; year?: number }>;
      extended?: Array<{ tmdbId?: number | null; title?: string; year?: number }>;
    }>;
  }>(snapshotRaw);
  const entries: AuthoritySnapshotEntry[] = [];
  for (const node of parsed.nodes ?? []) {
    if (typeof node.slug !== 'string') {
      continue;
    }
    for (const item of node.core ?? []) {
      if (typeof item.tmdbId === 'number') {
        entries.push({
          seasonSlug: spec.seasonSlug,
          packSlug: spec.packSlug,
          nodeSlug: node.slug,
          tmdbId: item.tmdbId,
          tier: 'CORE',
          title: item.title,
          year: item.year,
        });
      }
    }
    for (const item of node.extended ?? []) {
      if (typeof item.tmdbId === 'number') {
        entries.push({
          seasonSlug: spec.seasonSlug,
          packSlug: spec.packSlug,
          nodeSlug: node.slug,
          tmdbId: item.tmdbId,
          tier: 'EXTENDED',
          title: item.title,
          year: item.year,
        });
      }
    }
  }
  return entries;
}

export async function findSeasonIntegritySpecBySeason(seasonSlug: string): Promise<SeasonIntegritySpec> {
  const specs = await loadSeasonIntegrityRegistry();
  const match = specs.find((item) => item.seasonSlug === seasonSlug);
  if (!match) {
    throw new Error(`No season integrity registry entry for ${seasonSlug}.`);
  }
  return match;
}

export async function findSeasonIntegritySpecByPair(seasonSlug: string, packSlug: string): Promise<SeasonIntegritySpec> {
  const specs = await loadSeasonIntegrityRegistry();
  const match = specs.find((item) => item.seasonSlug === seasonSlug && item.packSlug === packSlug);
  if (!match) {
    throw new Error(`No season integrity registry entry for ${seasonSlug}/${packSlug}.`);
  }
  return match;
}
