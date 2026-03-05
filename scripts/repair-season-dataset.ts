import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma, PrismaClient, type NodeAssignmentTier } from '@prisma/client';
import { computeSnapshotDivergence, type DivergenceItem, type DivergenceSummary } from '../src/lib/audit/snapshot-db-divergence';
import { createSeasonNodeReleaseFromNodeMovie } from '../src/lib/nodes/governance/release-artifact';
import { getDeterministicCatalogBackfill } from '../src/lib/catalog/deterministic-tmdb-backfill';

type SeasonConfig = {
  seasonSlug: 'season-1' | 'season-2';
  packSlug: 'horror' | 'cult-classics';
  defaultTaxonomyVersion: string;
};

type AuthorityAssignment = {
  seasonSlug: string;
  packSlug: string;
  nodeSlug: string;
  tmdbId: number;
  tier: NodeAssignmentTier;
  rank: number;
  coreRank: number | null;
  title: string | null;
  year: number | null;
};

type RepairBuckets = {
  unresolvedTmdb: AuthorityAssignment[];
  missingPoster: AuthorityAssignment[];
  missingCredits: AuthorityAssignment[];
  missingVotes: AuthorityAssignment[];
  importerSchema: AuthorityAssignment[];
};

type SeasonRepairResult = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
  pre: DivergenceSummary;
  post: DivergenceSummary;
  applied: {
    insertedNodeMovies: number;
    correctedNodeDrift: number;
    correctedTierDrift: number;
    releaseItems: number;
    releaseId: string;
  };
  buckets: {
    unresolvedTmdb: Array<{ title: string; year: number | null; nodeSlug: string; tier: NodeAssignmentTier; tmdbId: number }>;
    missingPoster: Array<{ title: string; year: number | null; nodeSlug: string; tier: NodeAssignmentTier; tmdbId: number }>;
    missingCredits: Array<{ title: string; year: number | null; nodeSlug: string; tier: NodeAssignmentTier; tmdbId: number }>;
    missingVotes: Array<{ title: string; year: number | null; nodeSlug: string; tier: NodeAssignmentTier; tmdbId: number }>;
    importerSchema: Array<{ title: string; year: number | null; nodeSlug: string; tier: NodeAssignmentTier; tmdbId: number }>;
  };
};

const SEASON1_SNAPSHOT_PATH = path.resolve('backups', 'season1-horror-snapshot-2026-03-04T19-19-00-138Z.json');
const SEASON2_SNAPSHOT_PATH = path.resolve('docs', 'season', 'season-2-cult-classics-mastered.json');
const REPORT_PATH = path.resolve('docs', 'engineering', 'snapshot-db-repair-report.json');

type RepairOptions = {
  dryRun: boolean;
  reportPath: string;
  thresholdPercent: number;
  enforceThreshold: boolean;
};

const CONFIGS: SeasonConfig[] = [
  { seasonSlug: 'season-1', packSlug: 'horror', defaultTaxonomyVersion: 'season-1-horror-v3.5' },
  { seasonSlug: 'season-2', packSlug: 'cult-classics', defaultTaxonomyVersion: 'season-2-cult-v3' },
];

function parseCliOptions(): RepairOptions {
  const args = process.argv.slice(2);
  const reportIndex = args.findIndex((arg) => arg === '--report-path');
  const thresholdIndex = args.findIndex((arg) => arg === '--threshold-pct');
  const rawThreshold = thresholdIndex >= 0 ? Number(args[thresholdIndex + 1]) : NaN;

  return {
    dryRun: args.includes('--dry-run'),
    reportPath: reportIndex >= 0 && args[reportIndex + 1] ? path.resolve(args[reportIndex + 1]!) : REPORT_PATH,
    thresholdPercent: Number.isFinite(rawThreshold) && rawThreshold >= 0 ? rawThreshold : 2,
    enforceThreshold: !args.includes('--no-threshold-enforce'),
  };
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/^\uFEFF/, '')) as T;
}

function keyForAssignment(entry: { nodeSlug: string; tmdbId: number }): string {
  return `${entry.nodeSlug}:${entry.tmdbId}`;
}

async function loadSeason1Assignments(): Promise<AuthorityAssignment[]> {
  const raw = await fs.readFile(SEASON1_SNAPSHOT_PATH, 'utf8');
  const parsed = parseJson<{
    season?: { slug?: string };
    pack?: { slug?: string };
    assignments?: Array<{
      nodeSlug: string;
      tmdbId: number;
      tier: NodeAssignmentTier;
      rank?: number;
      coreRank?: number | null;
      evidence?: { matchTitle?: string; matchYear?: number };
    }>;
  }>(raw);
  return (parsed.assignments ?? []).map((item) => ({
    seasonSlug: parsed.season?.slug ?? 'season-1',
    packSlug: parsed.pack?.slug ?? 'horror',
    nodeSlug: item.nodeSlug,
    tmdbId: item.tmdbId,
    tier: item.tier,
    rank: typeof item.rank === 'number' ? item.rank : 0,
    coreRank: typeof item.coreRank === 'number' ? item.coreRank : null,
    title: item.evidence?.matchTitle ?? null,
    year: typeof item.evidence?.matchYear === 'number' ? item.evidence.matchYear : null,
  }));
}

async function loadSeason2Assignments(): Promise<AuthorityAssignment[]> {
  const raw = await fs.readFile(SEASON2_SNAPSHOT_PATH, 'utf8');
  const parsed = parseJson<{
    nodes?: Array<{
      slug: string;
      core?: Array<{ title: string; year: number; tmdbId?: number | null }>;
      extended?: Array<{ title: string; year: number; tmdbId?: number | null }>;
    }>;
  }>(raw);
  const entries: AuthorityAssignment[] = [];
  for (const node of parsed.nodes ?? []) {
    let rank = 1;
    let coreRank = 1;
    for (const item of node.core ?? []) {
      if (typeof item.tmdbId !== 'number') continue;
      entries.push({
        seasonSlug: 'season-2',
        packSlug: 'cult-classics',
        nodeSlug: node.slug,
        tmdbId: item.tmdbId,
        tier: 'CORE',
        rank,
        coreRank,
        title: item.title,
        year: item.year,
      });
      rank += 1;
      coreRank += 1;
    }
    for (const item of node.extended ?? []) {
      if (typeof item.tmdbId !== 'number') continue;
      entries.push({
        seasonSlug: 'season-2',
        packSlug: 'cult-classics',
        nodeSlug: node.slug,
        tmdbId: item.tmdbId,
        tier: 'EXTENDED',
        rank,
        coreRank: null,
        title: item.title,
        year: item.year,
      });
      rank += 1;
    }
  }
  return entries;
}

async function loadAuthorityAssignments(seasonSlug: string): Promise<AuthorityAssignment[]> {
  if (seasonSlug === 'season-1') return loadSeason1Assignments();
  if (seasonSlug === 'season-2') return loadSeason2Assignments();
  return [];
}

async function findPublishedRelease(prisma: PrismaClient, packId: string): Promise<{ id: string; taxonomyVersion: string } | null> {
  const release = await prisma.seasonNodeRelease.findFirst({
    where: { packId, isPublished: true },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, taxonomyVersion: true },
  });
  return release ?? null;
}

function buildBuckets(
  items: DivergenceItem[],
  authorityByKey: Map<string, AuthorityAssignment>,
): RepairBuckets {
  const buckets: RepairBuckets = {
    unresolvedTmdb: [],
    missingPoster: [],
    missingCredits: [],
    missingVotes: [],
    importerSchema: [],
  };

  for (const item of items) {
    if (item.category !== 'missing-in-db') continue;
    const entry = authorityByKey.get(keyForAssignment(item));
    if (!entry) continue;
    if (item.reason === 'unresolved-tmdb') buckets.unresolvedTmdb.push(entry);
    if (item.reason === 'eligibility-gate:poster') buckets.missingPoster.push(entry);
    if (item.reason === 'eligibility-gate:credits') buckets.missingCredits.push(entry);
    if (item.reason === 'eligibility-gate:votes') buckets.missingVotes.push(entry);
    if (item.reason === 'importer-schema') buckets.importerSchema.push(entry);
  }
  return buckets;
}

function sortEntries(entries: AuthorityAssignment[]): AuthorityAssignment[] {
  return entries
    .slice()
    .sort((a, b) => a.nodeSlug.localeCompare(b.nodeSlug) || a.rank - b.rank || a.tmdbId - b.tmdbId);
}

async function repairSeason(prisma: PrismaClient, config: SeasonConfig, options: RepairOptions): Promise<SeasonRepairResult> {
  const pack = await prisma.genrePack.findUnique({
    where: { slug: config.packSlug },
    select: { id: true, slug: true, season: { select: { id: true, slug: true } } },
  });
  if (!pack || pack.season.slug !== config.seasonSlug) {
    throw new Error(`Pack ${config.packSlug} is not linked to ${config.seasonSlug}`);
  }

  const published = await findPublishedRelease(prisma, pack.id);
  const taxonomyVersion = published?.taxonomyVersion ?? config.defaultTaxonomyVersion;
  const authorityAssignments = await loadAuthorityAssignments(config.seasonSlug);
  const authorityByKey = new Map(authorityAssignments.map((entry) => [keyForAssignment(entry), entry] as const));

  const pre = await computeSnapshotDivergence(prisma, {
    seasonSlug: config.seasonSlug,
    packSlug: config.packSlug,
    taxonomyVersion,
    releaseId: published?.id,
  });

  const buckets = buildBuckets(pre.items, authorityByKey);

  if (!options.dryRun) {
    await prisma.$transaction(async (tx) => {
      for (const entry of buckets.unresolvedTmdb) {
        const seed = getDeterministicCatalogBackfill(entry.tmdbId);
        if (!seed) continue;
        const movie = await tx.movie.upsert({
          where: { tmdbId: seed.tmdbId },
          create: {
            tmdbId: seed.tmdbId,
            title: seed.title,
            year: seed.year,
            posterUrl: seed.posterUrl,
            synopsis: seed.synopsis,
            genres: seed.genres,
            keywords: seed.keywords,
            country: seed.country,
            director: seed.director,
            castTop: seed.castTop,
          },
          update: {
            title: seed.title,
            year: seed.year,
            posterUrl: seed.posterUrl,
            synopsis: seed.synopsis,
            genres: seed.genres,
            keywords: seed.keywords,
            country: seed.country,
            director: seed.director,
            castTop: seed.castTop,
          },
          select: { id: true },
        });
        for (const rating of seed.ratings) {
          await tx.movieRating.upsert({
            where: {
              movieId_source: {
                movieId: movie.id,
                source: rating.source,
              },
            },
            create: {
              movieId: movie.id,
              source: rating.source,
              value: rating.value,
              scale: rating.scale,
              rawValue: rating.rawValue ?? null,
            },
            update: {
              value: rating.value,
              scale: rating.scale,
              rawValue: rating.rawValue ?? null,
            },
          });
        }
      }
    });
  }
  const tmdbIds = [...new Set(authorityAssignments.map((entry) => entry.tmdbId))];
  const [movies, nodes] = await Promise.all([
    prisma.movie.findMany({
      where: { tmdbId: { in: tmdbIds } },
      select: { id: true, tmdbId: true },
    }),
    prisma.journeyNode.findMany({
      where: { packId: pack.id },
      select: { id: true, slug: true },
    }),
  ]);

  const movieIdByTmdb = new Map(movies.map((movie) => [movie.tmdbId, movie.id] as const));
  const nodeIdBySlug = new Map(nodes.map((node) => [node.slug, node.id] as const));

  let insertedNodeMovies = 0;
  let correctedNodeDrift = 0;
  let correctedTierDrift = 0;
  let releaseId = 'dry-run';
  let releaseItems = 0;

  if (!options.dryRun) {
    await prisma.$transaction(async (tx) => {
      for (const entry of [...buckets.importerSchema, ...buckets.unresolvedTmdb]) {
        const movieId = movieIdByTmdb.get(entry.tmdbId);
        const nodeId = nodeIdBySlug.get(entry.nodeSlug);
        if (!movieId || !nodeId) continue;
        await tx.nodeMovie.upsert({
          where: { nodeId_movieId: { nodeId, movieId } },
          create: {
            nodeId,
            movieId,
            tier: entry.tier,
            rank: entry.rank,
            coreRank: entry.tier === 'CORE' ? entry.coreRank : null,
            source: 'snapshot-db-repair',
            score: 1,
            finalScore: 1,
            journeyScore: 1,
            runId: `snapshot-db-repair:${config.seasonSlug}`,
            taxonomyVersion,
            evidence: Prisma.JsonNull,
          },
          update: {
            tier: entry.tier,
            rank: entry.rank,
            coreRank: entry.tier === 'CORE' ? entry.coreRank : null,
            source: 'snapshot-db-repair',
            taxonomyVersion,
          },
        });
        insertedNodeMovies += 1;
      }

      for (const item of pre.items) {
        if (item.category !== 'node-drift') continue;
        const entry = authorityByKey.get(keyForAssignment(item));
        if (!entry) continue;
        const movieId = movieIdByTmdb.get(entry.tmdbId);
        const nodeId = nodeIdBySlug.get(entry.nodeSlug);
        if (!movieId || !nodeId) continue;
        await tx.nodeMovie.upsert({
          where: { nodeId_movieId: { nodeId, movieId } },
          create: {
            nodeId,
            movieId,
            tier: entry.tier,
            rank: entry.rank,
            coreRank: entry.tier === 'CORE' ? entry.coreRank : null,
            source: 'snapshot-db-repair',
            score: 1,
            finalScore: 1,
            journeyScore: 1,
            runId: `snapshot-db-repair:${config.seasonSlug}`,
            taxonomyVersion,
            evidence: Prisma.JsonNull,
          },
          update: {
            tier: entry.tier,
            rank: entry.rank,
            coreRank: entry.tier === 'CORE' ? entry.coreRank : null,
            source: 'snapshot-db-repair',
            taxonomyVersion,
          },
        });
        correctedNodeDrift += 1;
      }

      for (const item of pre.items) {
        if (item.category !== 'tier-drift') continue;
        const entry = authorityByKey.get(keyForAssignment(item));
        if (!entry) continue;
        const movieId = movieIdByTmdb.get(entry.tmdbId);
        const nodeId = nodeIdBySlug.get(entry.nodeSlug);
        if (!movieId || !nodeId) continue;
        const updated = await tx.nodeMovie.updateMany({
          where: { nodeId, movieId, taxonomyVersion },
          data: {
            tier: entry.tier,
            rank: entry.rank,
            coreRank: entry.tier === 'CORE' ? entry.coreRank : null,
            source: 'snapshot-db-repair',
          },
        });
        correctedTierDrift += updated.count;
      }
    });

    const releaseRunId = `snapshot-db-repair-${config.seasonSlug}-${new Date().toISOString()}`;
    const release = await createSeasonNodeReleaseFromNodeMovie(prisma, {
      seasonId: pack.season.id,
      packId: pack.id,
      taxonomyVersion,
      runId: releaseRunId,
      publish: true,
      metadata: {
        source: 'snapshot-db-repair',
        generatedAt: new Date().toISOString(),
        seasonSlug: config.seasonSlug,
        packSlug: config.packSlug,
      },
    });
    releaseId = release.releaseId;
    releaseItems = release.itemCount;
  } else {
    const canResolveMovie = (tmdbId: number): boolean => movieIdByTmdb.has(tmdbId) || getDeterministicCatalogBackfill(tmdbId) !== null;
    insertedNodeMovies = [...buckets.importerSchema, ...buckets.unresolvedTmdb]
      .filter((entry) => nodeIdBySlug.has(entry.nodeSlug) && canResolveMovie(entry.tmdbId))
      .length;
    correctedNodeDrift = pre.items
      .filter((item) => item.category === 'node-drift')
      .filter((item) => {
        const entry = authorityByKey.get(keyForAssignment(item));
        return Boolean(entry && nodeIdBySlug.has(entry.nodeSlug) && canResolveMovie(entry.tmdbId));
      })
      .length;
    correctedTierDrift = pre.items
      .filter((item) => item.category === 'tier-drift')
      .filter((item) => {
        const entry = authorityByKey.get(keyForAssignment(item));
        return Boolean(entry && nodeIdBySlug.has(entry.nodeSlug) && canResolveMovie(entry.tmdbId));
      })
      .length;
  }

  const post = options.dryRun
    ? pre
    : await computeSnapshotDivergence(prisma, {
      seasonSlug: config.seasonSlug,
      packSlug: config.packSlug,
      taxonomyVersion,
      releaseId,
    });

  const toTitles = (entries: AuthorityAssignment[]) => sortEntries(entries).map((entry) => ({
    title: entry.title ?? `tmdb:${entry.tmdbId}`,
    year: entry.year,
    nodeSlug: entry.nodeSlug,
    tier: entry.tier,
    tmdbId: entry.tmdbId,
  }));

  return {
    seasonSlug: config.seasonSlug,
    packSlug: config.packSlug,
    taxonomyVersion,
    pre,
    post,
    applied: {
      insertedNodeMovies,
      correctedNodeDrift,
      correctedTierDrift,
      releaseItems,
      releaseId,
    },
    buckets: {
      unresolvedTmdb: toTitles(buckets.unresolvedTmdb),
      missingPoster: toTitles(buckets.missingPoster),
      missingCredits: toTitles(buckets.missingCredits),
      missingVotes: toTitles(buckets.missingVotes),
      importerSchema: toTitles(buckets.importerSchema),
    },
  };
}

function summariseReasons(entries: AuthorityAssignment[]): Record<string, number> {
  const summary = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.tier;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(summary);
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  const prisma = new PrismaClient();
  try {
    const results: SeasonRepairResult[] = [];
    for (const config of CONFIGS) {
      const result = await repairSeason(prisma, config, options);
      results.push(result);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      results: results.map((result) => ({
        seasonSlug: result.seasonSlug,
        packSlug: result.packSlug,
        taxonomyVersion: result.taxonomyVersion,
        pre: {
          lossRatePercent: result.pre.lossRatePercent,
          missingInDbCount: result.pre.missingInDbCount,
          missingInReleaseCount: result.pre.missingInReleaseCount,
          tierDriftCount: result.pre.tierDriftCount,
          nodeDriftCount: result.pre.nodeDriftCount,
        },
        post: {
          lossRatePercent: result.post.lossRatePercent,
          missingInDbCount: result.post.missingInDbCount,
          missingInReleaseCount: result.post.missingInReleaseCount,
          tierDriftCount: result.post.tierDriftCount,
          nodeDriftCount: result.post.nodeDriftCount,
        },
        applied: result.applied,
        buckets: result.buckets,
        bucketTierBreakdown: {
          unresolvedTmdb: summariseReasons(result.buckets.unresolvedTmdb.map((row) => ({
            seasonSlug: result.seasonSlug,
            packSlug: result.packSlug,
            nodeSlug: row.nodeSlug,
            tmdbId: row.tmdbId,
            tier: row.tier,
            rank: 0,
            coreRank: null,
            title: row.title,
            year: row.year,
          }))),
          missingPoster: summariseReasons(result.buckets.missingPoster.map((row) => ({
            seasonSlug: result.seasonSlug,
            packSlug: result.packSlug,
            nodeSlug: row.nodeSlug,
            tmdbId: row.tmdbId,
            tier: row.tier,
            rank: 0,
            coreRank: null,
            title: row.title,
            year: row.year,
          }))),
          missingCredits: summariseReasons(result.buckets.missingCredits.map((row) => ({
            seasonSlug: result.seasonSlug,
            packSlug: result.packSlug,
            nodeSlug: row.nodeSlug,
            tmdbId: row.tmdbId,
            tier: row.tier,
            rank: 0,
            coreRank: null,
            title: row.title,
            year: row.year,
          }))),
          missingVotes: summariseReasons(result.buckets.missingVotes.map((row) => ({
            seasonSlug: result.seasonSlug,
            packSlug: result.packSlug,
            nodeSlug: row.nodeSlug,
            tmdbId: row.tmdbId,
            tier: row.tier,
            rank: 0,
            coreRank: null,
            title: row.title,
            year: row.year,
          }))),
          importerSchema: summariseReasons(result.buckets.importerSchema.map((row) => ({
            seasonSlug: result.seasonSlug,
            packSlug: result.packSlug,
            nodeSlug: row.nodeSlug,
            tmdbId: row.tmdbId,
            tier: row.tier,
            rank: 0,
            coreRank: null,
            title: row.title,
            year: row.year,
          }))),
        },
      })),
    };

    await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
    await fs.writeFile(options.reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[repair-season-dataset] wrote report ${options.reportPath}`);

    for (const result of results) {
      console.log(
        `[repair-season-dataset] ${result.seasonSlug}/${result.packSlug} preLoss=${result.pre.lossRatePercent}% postLoss=${result.post.lossRatePercent}% inserted=${result.applied.insertedNodeMovies} nodeFixes=${result.applied.correctedNodeDrift} tierFixes=${result.applied.correctedTierDrift} releaseItems=${result.applied.releaseItems} dryRun=${options.dryRun}`,
      );
    }

    const failed = results.filter((result) => result.post.lossRatePercent >= options.thresholdPercent);
    if (options.enforceThreshold && !options.dryRun && failed.length > 0) {
      const detail = failed.map((item) => `${item.seasonSlug}:${item.post.lossRatePercent}%`).join(', ');
      throw new Error(`Loss rate is still >= ${options.thresholdPercent}% after repair (${detail})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[repair-season-dataset] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
