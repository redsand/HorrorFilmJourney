import type { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';

type SeasonAuthorityEntry = {
  seasonSlug: string;
  packSlug: string;
  nodeSlug: string;
  tmdbId: number;
  tier: 'CORE' | 'EXTENDED';
  title?: string;
};

type NodeAssignment = {
  nodeSlug: string;
  tmdbId: number;
  tier: 'CORE' | 'EXTENDED';
};

export type DivergenceCategory = 'missing-in-db' | 'missing-in-release' | 'tier-drift' | 'node-drift';

export type DivergenceItem = {
  category: DivergenceCategory;
  seasonSlug: string;
  packSlug: string;
  nodeSlug: string;
  tmdbId: number;
  tier: 'CORE' | 'EXTENDED';
  observedNodeSlug?: string;
  observedTier?: 'CORE' | 'EXTENDED';
  reason?: string;
  details?: Record<string, unknown>;
};

export type DivergenceSummary = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
  curatorAuthorityCount: number;
  authorityCoreCount: number;
  missingInDbCount: number;
  missingInReleaseCount: number;
  tierDriftCount: number;
  nodeDriftCount: number;
  lossRatePercent: number;
  releaseCoreCount: number;
  coreCountDelta: number;
  items: DivergenceItem[];
};

const SEASON1_SNAPSHOT_PATH = path.resolve(
  'backups',
  'season1-horror-snapshot-2026-03-04T19-19-00-138Z.json',
);
const SEASON2_SNAPSHOT_PATH = path.resolve('docs', 'season', 'season-2-cult-classics-mastered.json');
const RELEASE_CORE_CONTRACT_DIR = path.resolve('artifacts', 'release-core-contract');

export function shouldFailPublish(lossRatePct: number, thresholdPct: number, override: boolean): boolean {
  return lossRatePct > thresholdPct && !override;
}

export function classifyMissingReason(movie: { posterUrl?: string | null; castTop?: string | string[] | null; ratings?: Array<{ source: string; value: number }> } | null): string {
  if (!movie) {
    return 'unresolved-tmdb';
  }
  if (!movie.posterUrl) {
    return 'eligibility-gate:poster';
  }
  const castCount = Array.isArray(movie.castTop) ? movie.castTop.length : (typeof movie.castTop === 'string' && movie.castTop.length > 0 ? 1 : 0);
  if (castCount === 0) {
    return 'eligibility-gate:credits';
  }
  if (!movie.ratings || movie.ratings.length === 0) {
    return 'eligibility-gate:votes';
  }
  return 'importer-schema';
}

async function loadAuthoritySnapshot(seasonSlug: string): Promise<SeasonAuthorityEntry[]> {
  if (seasonSlug === 'season-2') {
    const content = await fs.readFile(SEASON2_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(content) as { nodes: Array<{ slug: string; core?: Array<{ tmdbId?: number }>; extended?: Array<{ tmdbId?: number }> }> };
    const entries: SeasonAuthorityEntry[] = [];
    for (const node of parsed.nodes ?? []) {
      const core = node.core ?? [];
      const extended = node.extended ?? [];
      for (const item of core) {
        if (typeof item.tmdbId === 'number') {
          entries.push({
            seasonSlug,
            packSlug: 'cult-classics',
            nodeSlug: node.slug,
            tmdbId: item.tmdbId,
            tier: 'CORE',
          });
        }
      }
      for (const item of extended) {
        if (typeof item.tmdbId === 'number') {
          entries.push({
            seasonSlug,
            packSlug: 'cult-classics',
            nodeSlug: node.slug,
            tmdbId: item.tmdbId,
            tier: 'EXTENDED',
          });
        }
      }
    }
    return entries;
  }

  if (seasonSlug === 'season-1') {
    const content = await fs.readFile(SEASON1_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(content) as { assignments: Array<{ nodeSlug: string; tmdbId: number; tier: 'CORE' | 'EXTENDED' }> };
    return (parsed.assignments ?? []).map((assignment) => ({
      seasonSlug,
      packSlug: 'horror',
      nodeSlug: assignment.nodeSlug,
      tmdbId: assignment.tmdbId,
      tier: assignment.tier,
    }));
  }

  throw new Error(`No authority snapshot defined for ${seasonSlug}`);
}

async function loadNodeMovies(prisma: PrismaClient, packId: string, taxonomyVersion: string): Promise<NodeAssignment[]> {
  const rows = await prisma.nodeMovie.findMany({
    where: {
      node: { packId },
      taxonomyVersion,
    },
    include: {
      node: { select: { slug: true } },
      movie: { select: { tmdbId: true } },
    },
  });
  return rows.map((row) => ({
    nodeSlug: row.node.slug,
    tmdbId: row.movie.tmdbId,
    tier: row.tier,
  }));
}

async function loadReleaseAssignments(prisma: PrismaClient, releaseId: string): Promise<NodeAssignment[]> {
  const rows = await prisma.seasonNodeReleaseItem.findMany({
    where: { releaseId },
    include: { movie: { select: { tmdbId: true } } },
  });
  return rows.map((row) => ({
    nodeSlug: row.nodeSlug,
    tmdbId: row.movie.tmdbId,
    tier: 'CORE', // release items only contain CORE items at the moment
  }));
}

function buildTmdbMap(assignments: NodeAssignment[]): Map<number, NodeAssignment[]> {
  const map = new Map<number, NodeAssignment[]>();
  for (const entry of assignments) {
    const bucket = map.get(entry.tmdbId) ?? [];
    bucket.push(entry);
    map.set(entry.tmdbId, bucket);
  }
  return map;
}

export async function computeSnapshotDivergence(prisma: PrismaClient, input: {
  seasonSlug: string;
  packSlug: 'horror' | 'cult-classics';
  taxonomyVersion: string;
  releaseId?: string;
  thresholdOverridePercent?: number;
}): Promise<DivergenceSummary> {
  const pack = await prisma.genrePack.findUnique({
    where: { slug: input.packSlug },
    select: {
      id: true,
      slug: true,
      season: { select: { slug: true } },
    },
  });
  if (!pack || pack.season.slug !== input.seasonSlug) {
    throw new Error(`Pack ${input.packSlug} not tied to season ${input.seasonSlug}`);
  }

  const authorityItems = await loadAuthoritySnapshot(input.seasonSlug);
  const authorityCount = authorityItems.length;
  const authorityCoreCount = authorityItems.reduce((count, entry) => (entry.tier === 'CORE' ? count + 1 : count), 0);
  const nodeMovies = await loadNodeMovies(prisma, pack.id, input.taxonomyVersion);
  const dbMap = buildTmdbMap(nodeMovies);

  let releaseId = input.releaseId;
  if (!releaseId) {
    const published = await prisma.seasonNodeRelease.findFirst({
      where: { packId: pack.id, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    releaseId = published?.id ?? null;
  }
  const releaseAssignments = releaseId ? await loadReleaseAssignments(prisma, releaseId) : [];
  const releaseCoreCount = releaseAssignments.length;
  const releaseMap = buildTmdbMap(releaseAssignments);

  const items: DivergenceItem[] = [];
  let missingInDbCount = 0;
  let missingInReleaseCount = 0;
  let tierDriftCount = 0;
  let nodeDriftCount = 0;

  for (const authority of authorityItems) {
    const key = `${authority.nodeSlug}:${authority.tmdbId}`;
    const dbMatches = nodeMovies.filter((entry) => entry.tmdbId === authority.tmdbId && entry.nodeSlug === authority.nodeSlug);
    if (dbMatches.length === 0) {
      const alt = nodeMovies.find((entry) => entry.tmdbId === authority.tmdbId && entry.nodeSlug !== authority.nodeSlug);
      const movie = await prisma.movie.findUnique({
        where: { tmdbId: authority.tmdbId },
    select: { posterUrl: true, castTop: true, ratings: { select: { source: true, value: true } } },
      });
      if (alt) {
        nodeDriftCount += 1;
        items.push({
          category: 'node-drift',
          seasonSlug: authority.seasonSlug,
          packSlug: authority.packSlug,
          nodeSlug: authority.nodeSlug,
          tmdbId: authority.tmdbId,
          tier: authority.tier,
          observedNodeSlug: alt.nodeSlug,
          reason: 'slug-mismatch',
        });
      } else {
        missingInDbCount += 1;
        items.push({
          category: 'missing-in-db',
          seasonSlug: authority.seasonSlug,
          packSlug: authority.packSlug,
          nodeSlug: authority.nodeSlug,
          tmdbId: authority.tmdbId,
          tier: authority.tier,
          reason: classifyMissingReason(movie),
        });
      }
      continue;
    }

    const dbEntry = dbMatches[0];
    if (dbEntry.tier !== authority.tier) {
      tierDriftCount += 1;
      items.push({
        category: 'tier-drift',
        seasonSlug: authority.seasonSlug,
        packSlug: authority.packSlug,
        nodeSlug: authority.nodeSlug,
        tmdbId: authority.tmdbId,
        tier: authority.tier,
        observedTier: dbEntry.tier,
      });
    }

    if (authority.tier === 'CORE') {
      const releaseMatches = releaseAssignments.filter(
        (entry) => entry.tmdbId === authority.tmdbId && entry.nodeSlug === authority.nodeSlug,
      );
      if (releaseMatches.length === 0) {
        const altRelease = releaseAssignments.find(
          (entry) => entry.tmdbId === authority.tmdbId && entry.nodeSlug !== authority.nodeSlug,
        );
        if (altRelease) {
          nodeDriftCount += 1;
          items.push({
            category: 'node-drift',
            seasonSlug: authority.seasonSlug,
            packSlug: authority.packSlug,
            nodeSlug: authority.nodeSlug,
            tmdbId: authority.tmdbId,
            tier: authority.tier,
            observedNodeSlug: altRelease.nodeSlug,
            reason: 'slug-mismatch',
          });
        } else {
          missingInReleaseCount += 1;
          items.push({
            category: 'missing-in-release',
            seasonSlug: authority.seasonSlug,
            packSlug: authority.packSlug,
            nodeSlug: authority.nodeSlug,
            tmdbId: authority.tmdbId,
            tier: authority.tier,
            reason: 'not published',
          });
        }
      }
    }
  }

  const totalLoss = missingInReleaseCount + missingInDbCount;
  const lossRatePercent = authorityCount === 0 ? 0 : (totalLoss / authorityCount) * 100;

  return {
    seasonSlug: input.seasonSlug,
    packSlug: input.packSlug,
    taxonomyVersion: input.taxonomyVersion,
    curatorAuthorityCount: authorityCount,
    authorityCoreCount,
    missingInDbCount,
    missingInReleaseCount,
    tierDriftCount,
    nodeDriftCount,
    lossRatePercent: Number(lossRatePercent.toFixed(2)),
    releaseCoreCount,
    coreCountDelta: releaseCoreCount - authorityCoreCount,
    items,
  };
}

async function ensureArtifactDir(): Promise<string> {
  const dir = path.resolve('artifacts', 'snapshot-db-divergence');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function emitUnresolvedReport(summary: DivergenceSummary): Promise<string> {
  const dir = await ensureArtifactDir();
  const unresolved = summary.items.filter((item) => item.reason?.startsWith('unresolved'));
  const filename = path.join(dir, `${summary.seasonSlug}-unresolved.json`);
  await fs.writeFile(filename, JSON.stringify({ generatedAt: new Date().toISOString(), unresolved }, null, 2), 'utf8');
  return filename;
}

async function ensureReleaseContractDir(): Promise<string> {
  await fs.mkdir(RELEASE_CORE_CONTRACT_DIR, { recursive: true });
  return RELEASE_CORE_CONTRACT_DIR;
}

export async function emitReleaseContractReport(summary: DivergenceSummary): Promise<string> {
  const dir = await ensureReleaseContractDir();
  const releaseDiffs = summary.items.filter((item) => item.category === 'missing-in-release' || item.category === 'node-drift');
  const report = {
    generatedAt: new Date().toISOString(),
    seasonSlug: summary.seasonSlug,
    packSlug: summary.packSlug,
    taxonomyVersion: summary.taxonomyVersion,
    snapshotCoreCount: summary.authorityCoreCount,
    releaseCoreCount: summary.releaseCoreCount,
    delta: summary.coreCountDelta,
    releaseDiffs,
  };
  const filename = path.join(dir, `${summary.seasonSlug}-release-core-contract.json`);
  await fs.writeFile(filename, JSON.stringify(report, null, 2), 'utf8');
  return filename;
}

export async function enforceSnapshotGuardrail(prisma: PrismaClient, input: {
  seasonSlug: string;
  packSlug: 'horror' | 'cult-classics';
  taxonomyVersion: string;
  releaseId: string;
  thresholdPercent?: number;
  overrideEnv?: boolean;
}): Promise<DivergenceSummary> {
  const summary = await computeSnapshotDivergence(prisma, {
    seasonSlug: input.seasonSlug,
    packSlug: input.packSlug,
    taxonomyVersion: input.taxonomyVersion,
    releaseId: input.releaseId,
  });
  await emitUnresolvedReport(summary);
  await emitReleaseContractReport(summary);
  const threshold = input.thresholdPercent ?? Number(process.env.SNAPSHOT_DIVERGENCE_THRESHOLD_PCT ?? '2');
  const override = input.overrideEnv ?? process.env.SNAPSHOT_DIVERGENCE_OVERRIDE === 'true';
  if (shouldFailPublish(summary.lossRatePercent, threshold, override)) {
    throw new Error(`[snapshot guardrail] loss rate ${summary.lossRatePercent}% exceeds threshold ${threshold}%, unresolved report emitted`);
  }
  return summary;
}
