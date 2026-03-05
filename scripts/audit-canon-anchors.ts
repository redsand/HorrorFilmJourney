import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, type NodeAssignmentTier } from '@prisma/client';

type AnchorEntry = {
  tmdbId: number;
  title: string;
  year: number;
  nodeSlug: string;
  tier: NodeAssignmentTier;
};

type AnchorFile = {
  seasonSlug: 'season-1' | 'season-2';
  packSlug: 'horror' | 'cult-classics';
  anchors: AnchorEntry[];
};

type SnapshotEntry = {
  tmdbId: number;
  nodeSlug: string;
  tier: NodeAssignmentTier;
};

type AnchorLayerStatus = {
  catalog: boolean;
  snapshot: boolean;
  nodeMovie: boolean;
  publishedRelease: boolean;
};

type AnchorAuditRow = {
  seasonSlug: string;
  packSlug: string;
  tmdbId: number;
  title: string;
  year: number;
  nodeSlug: string;
  tier: NodeAssignmentTier;
  status: AnchorLayerStatus;
  missingLayers: string[];
};

const SEASON1_ANCHORS_PATH = path.resolve('docs', 'season', 'season-1-horror-anchors.json');
const SEASON2_ANCHORS_PATH = path.resolve('docs', 'season', 'season-2-cult-anchors.json');
const SEASON1_SNAPSHOT_PATH = path.resolve('backups', 'season1-horror-snapshot-2026-03-04T19-19-00-138Z.json');
const SEASON2_SNAPSHOT_PATH = path.resolve('docs', 'season', 'season-2-cult-classics-mastered.json');
const REPORT_JSON_PATH = path.resolve('docs', 'engineering', 'canon-anchor-integrity-report.json');
const REPORT_MD_PATH = path.resolve('docs', 'engineering', 'canon-anchor-integrity-audit.md');

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function loadSnapshotEntries(seasonSlug: 'season-1' | 'season-2'): Promise<SnapshotEntry[]> {
  if (seasonSlug === 'season-1') {
    const payload = await readJsonFile<{
      assignments?: Array<{ tmdbId: number; nodeSlug: string; tier: NodeAssignmentTier }>;
    }>(SEASON1_SNAPSHOT_PATH);
    return (payload.assignments ?? []).map((row) => ({
      tmdbId: row.tmdbId,
      nodeSlug: row.nodeSlug,
      tier: row.tier,
    }));
  }

  const payload = await readJsonFile<{
    nodes?: Array<{
      slug: string;
      core?: Array<{ tmdbId?: number }>;
      extended?: Array<{ tmdbId?: number }>;
    }>;
  }>(SEASON2_SNAPSHOT_PATH);
  const entries: SnapshotEntry[] = [];
  for (const node of payload.nodes ?? []) {
    for (const film of node.core ?? []) {
      if (typeof film.tmdbId === 'number') {
        entries.push({ tmdbId: film.tmdbId, nodeSlug: node.slug, tier: 'CORE' });
      }
    }
    for (const film of node.extended ?? []) {
      if (typeof film.tmdbId === 'number') {
        entries.push({ tmdbId: film.tmdbId, nodeSlug: node.slug, tier: 'EXTENDED' });
      }
    }
  }
  return entries;
}

function makeStatus(status: AnchorLayerStatus): string[] {
  const missing: string[] = [];
  if (!status.catalog) missing.push('catalog');
  if (!status.snapshot) missing.push('snapshot');
  if (!status.nodeMovie) missing.push('nodeMovie');
  if (!status.publishedRelease) missing.push('publishedRelease');
  return missing;
}

function reportMarkdown(rows: AnchorAuditRow[]): string {
  const generatedAt = new Date().toISOString();
  const missingRows = rows.filter((row) => row.missingLayers.length > 0);
  const bySeason = new Map<string, AnchorAuditRow[]>();
  for (const row of rows) {
    const bucket = bySeason.get(row.seasonSlug) ?? [];
    bucket.push(row);
    bySeason.set(row.seasonSlug, bucket);
  }

  const lines: string[] = [];
  lines.push('# Canon Anchor Integrity Audit');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Status: ${missingRows.length === 0 ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Season | Anchors | Missing |');
  lines.push('| --- | ---: | ---: |');
  for (const [season, bucket] of bySeason.entries()) {
    const missing = bucket.filter((row) => row.missingLayers.length > 0).length;
    lines.push(`| ${season} | ${bucket.length} | ${missing} |`);
  }
  lines.push('');

  if (missingRows.length === 0) {
    lines.push('All anchors are present in catalog, snapshots, NodeMovie assignments, and published releases.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Missing Anchors');
  lines.push('');
  lines.push('| Season | Title | Year | tmdbId | Node | Tier | Missing Layers |');
  lines.push('| --- | --- | ---: | ---: | --- | --- | --- |');
  for (const row of missingRows) {
    lines.push(`| ${row.seasonSlug} | ${row.title} | ${row.year} | ${row.tmdbId} | ${row.nodeSlug} | ${row.tier} | ${row.missingLayers.join(', ')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function auditSeason(prisma: PrismaClient, anchorFile: AnchorFile): Promise<AnchorAuditRow[]> {
  const snapshotEntries = await loadSnapshotEntries(anchorFile.seasonSlug);
  const snapshotKey = new Set(snapshotEntries.map((entry) => `${entry.tmdbId}:${entry.nodeSlug}:${entry.tier}`));

  const pack = await prisma.genrePack.findUnique({
    where: { slug: anchorFile.packSlug },
    select: { id: true, slug: true, season: { select: { slug: true } } },
  });
  if (!pack || pack.season.slug !== anchorFile.seasonSlug) {
    throw new Error(`Pack ${anchorFile.packSlug} is not linked to ${anchorFile.seasonSlug}`);
  }

  const release = await prisma.seasonNodeRelease.findFirst({
    where: { packId: pack.id, isPublished: true },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, taxonomyVersion: true },
  });

  const rows: AnchorAuditRow[] = [];
  for (const anchor of anchorFile.anchors) {
    // eslint-disable-next-line no-await-in-loop
    const [catalogHit, nodeMovieHit, publishedHit] = await Promise.all([
      prisma.movie.findUnique({
        where: { tmdbId: anchor.tmdbId },
        select: { id: true },
      }),
      prisma.nodeMovie.findFirst({
        where: {
          tier: anchor.tier,
          node: {
            packId: pack.id,
            slug: anchor.nodeSlug,
          },
          movie: {
            tmdbId: anchor.tmdbId,
          },
          ...(release?.taxonomyVersion ? { taxonomyVersion: release.taxonomyVersion } : {}),
        },
        select: { id: true },
      }),
      release
        ? prisma.seasonNodeReleaseItem.findFirst({
          where: {
            releaseId: release.id,
            nodeSlug: anchor.nodeSlug,
            movie: { tmdbId: anchor.tmdbId },
          },
          select: { id: true },
        })
        : Promise.resolve(null),
    ]);

    const status: AnchorLayerStatus = {
      catalog: Boolean(catalogHit),
      snapshot: snapshotKey.has(`${anchor.tmdbId}:${anchor.nodeSlug}:${anchor.tier}`),
      nodeMovie: Boolean(nodeMovieHit),
      publishedRelease: Boolean(publishedHit),
    };
    rows.push({
      seasonSlug: anchorFile.seasonSlug,
      packSlug: anchorFile.packSlug,
      tmdbId: anchor.tmdbId,
      title: anchor.title,
      year: anchor.year,
      nodeSlug: anchor.nodeSlug,
      tier: anchor.tier,
      status,
      missingLayers: makeStatus(status),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const season1 = await readJsonFile<AnchorFile>(SEASON1_ANCHORS_PATH);
  const season2 = await readJsonFile<AnchorFile>(SEASON2_ANCHORS_PATH);
  const prisma = new PrismaClient();
  try {
    const [rows1, rows2] = await Promise.all([
      auditSeason(prisma, season1),
      auditSeason(prisma, season2),
    ]);
    const rows = [...rows1, ...rows2];
    const missingRows = rows.filter((row) => row.missingLayers.length > 0);

    const report = {
      generatedAt: new Date().toISOString(),
      totalAnchors: rows.length,
      missingCount: missingRows.length,
      rows,
    };

    await fs.mkdir(path.dirname(REPORT_JSON_PATH), { recursive: true });
    await fs.writeFile(REPORT_JSON_PATH, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(REPORT_MD_PATH, reportMarkdown(rows), 'utf8');

    console.log(`[audit-canon-anchors] wrote ${REPORT_JSON_PATH}`);
    console.log(`[audit-canon-anchors] wrote ${REPORT_MD_PATH}`);
    if (missingRows.length > 0) {
      const sample = missingRows.slice(0, 10).map((row) => `${row.seasonSlug}:${row.title} -> ${row.missingLayers.join('|')}`);
      console.error('[audit-canon-anchors] missing anchors detected');
      sample.forEach((line) => console.error(`- ${line}`));
      process.exit(1);
    }
    console.log('[audit-canon-anchors] PASS');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[audit-canon-anchors] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
