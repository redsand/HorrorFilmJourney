import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ensureLocalDatabaseOrThrow, parseOption } from './catalog-release-utils';
import {
  buildSeason1MetadataUpdate,
  buildTmdbSeason1MetadataBackfillUrl,
  parseTmdbMetadataBackfill,
  type TmdbMetadataBackfillPayload,
} from '../src/lib/tmdb/metadata-backfill';
import { computeCoverageGateMetrics } from '../src/lib/verification/catalog-coverage-gate';
import { computeVoteCountCoverageBreakdown } from '../src/lib/metrics/catalog-coverage';

type BackfillProgress = {
  schemaVersion: 1;
  updatedAt: string;
  totalCandidates: number;
  processedMovieIds: string[];
  cursorTmdbId: number | null;
  failed: Array<{ movieId: string; tmdbId: number; reason: string }>;
};

type OmissionTriageEntry = {
  movieId: string;
  tmdbId: number;
  triageClass: string;
};

type OmissionTriageArtifact = {
  top100?: OmissionTriageEntry[];
};

type BackfillScope = 'bucketB' | 'all';
type MetadataField = 'overview' | 'keywords' | 'credits' | 'runtime' | 'voteCount';

const ARTIFACT_DIR = resolve('artifacts/backfills/metadata-backfill');
const BEFORE_PATH = resolve(ARTIFACT_DIR, 'before.json');
const AFTER_PATH = resolve(ARTIFACT_DIR, 'after.json');
const COVERAGE_PATH = resolve(ARTIFACT_DIR, 'updatedCoverage.json');

function parseIntOption(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseScopeOption(value: string | null): BackfillScope {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'all') return 'all';
  return 'bucketB';
}

function parseFieldsOption(value: string | null): Set<MetadataField> {
  const normalized = (value ?? 'all').trim().toLowerCase();
  if (!normalized || normalized === 'all') {
    return new Set<MetadataField>(['overview', 'keywords', 'credits', 'runtime', 'voteCount']);
  }
  const tokens = normalized
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const out = new Set<MetadataField>();
  for (const token of tokens) {
    if (token === 'overview') out.add('overview');
    if (token === 'keywords') out.add('keywords');
    if (token === 'credits') out.add('credits');
    if (token === 'runtime') out.add('runtime');
    if (token === 'votecount' || token === 'votecount') out.add('voteCount');
  }
  return out.size > 0 ? out : new Set<MetadataField>(['overview', 'keywords', 'credits', 'runtime', 'voteCount']);
}

function parseCastNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
        return ((entry as { name: string }).name).trim();
      }
      return '';
    })
    .filter((entry) => entry.length > 0);
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function toSortedFieldList(fields: Set<MetadataField>): MetadataField[] {
  return [...fields].sort((a, b) => a.localeCompare(b)) as MetadataField[];
}

function buildProgressPath(fields: Set<MetadataField>): string {
  const names = toSortedFieldList(fields);
  const suffix = names.join('-');
  return resolve(ARTIFACT_DIR, `progress.${suffix}.json`);
}

async function readProgressAt(path: string): Promise<BackfillProgress | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as BackfillProgress;
  } catch {
    return null;
  }
}

async function writeProgressAt(path: string, progress: BackfillProgress): Promise<void> {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(path, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
}

async function latestCoverageAuditDir(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
  if (dirs.length === 0) {
    throw new Error(`No coverage audit directories found in ${root}`);
  }
  return resolve(root, dirs[0]!);
}

async function readBucketBMovieIds(): Promise<Set<string>> {
  const explicitPath = process.env.SEASON1_OMISSION_TRIAGE_PATH?.trim();
  const triagePath = explicitPath
    ? resolve(explicitPath)
    : resolve(await latestCoverageAuditDir(resolve('artifacts/season1/coverage-audit')), 'omission-triage.json');
  const raw = await readFile(triagePath, 'utf8');
  const parsed = JSON.parse(raw) as OmissionTriageArtifact;
  const rows = Array.isArray(parsed.top100) ? parsed.top100 : [];
  return new Set(rows.filter((row) => row.triageClass === 'B').map((row) => row.movieId));
}

async function fetchWithRetry(url: URL, maxRetries: number): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(12_000) });
      if (response.status !== 429 || attempt >= maxRetries) {
        return response;
      }
      const retryAfterRaw = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : Number.NaN;
      const waitMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(500, retryAfterSeconds * 1000)
        : Math.min(10_000, 500 * (2 ** attempt));
      await new Promise((resolveDelay) => setTimeout(resolveDelay, waitMs));
      attempt += 1;
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      const waitMs = Math.min(10_000, 500 * (2 ** attempt));
      await new Promise((resolveDelay) => setTimeout(resolveDelay, waitMs));
      attempt += 1;
    }
  }
}

async function gatherCoverage(prisma: PrismaClient): Promise<{
  totalTmdbMovies: number;
  creditsCoveragePct: number;
  runtimeCoveragePct: number;
  voteCountFieldPresencePct: number;
  voteCountPositiveCoveragePct: number;
  voteCountZeroRatePct: number;
  voteCountNullRatePct: number;
  overviewCoveragePct: number;
  keywordsCoveragePct: number;
  sampleMissingTmdbIds: {
    credits: number[];
    runtime: number[];
    voteCountNull: number[];
    voteCountZero: number[];
    overview: number[];
    keywords: number[];
  };
}> {
  const movies = await prisma.movie.findMany({
    where: { tmdbId: { gt: 0 } },
    select: {
      tmdbId: true,
      synopsis: true,
      director: true,
      castTop: true,
      keywords: true,
      ratings: { select: { source: true, value: true, rawValue: true } },
    },
    orderBy: [{ tmdbId: 'asc' }],
  });
  const total = movies.length;
  const missingCredits = movies.filter((movie) =>
    !(movie.director && movie.director.trim().length > 0) || parseCastNames(movie.castTop).length === 0);
  const missingRuntime = movies.filter((movie) =>
    !movie.ratings.some((rating) => rating.source === 'TMDB_RUNTIME' && rating.value > 0));
  const voteCoverage = computeVoteCountCoverageBreakdown(
    movies.map((movie) => ({
      tmdbId: movie.tmdbId,
      ratings: movie.ratings.map((rating) => ({ source: rating.source, value: rating.value })),
    })),
  );
  const missingOverview = movies.filter((movie) =>
    !(typeof movie.synopsis === 'string' && movie.synopsis.trim().length > 0));
  const missingKeywords = movies.filter((movie) => parseJsonStringArray(movie.keywords).length === 0);

  const toPct = (n: number): number => (total > 0 ? Number(((n / total) * 100).toFixed(6)) : 0);

  return {
    totalTmdbMovies: total,
    creditsCoveragePct: toPct(total - missingCredits.length),
    runtimeCoveragePct: toPct(total - missingRuntime.length),
    voteCountFieldPresencePct: Number((voteCoverage.voteCountFieldPresence * 100).toFixed(6)),
    voteCountPositiveCoveragePct: Number((voteCoverage.voteCountPositiveCoverage * 100).toFixed(6)),
    voteCountZeroRatePct: Number((voteCoverage.voteCountZeroRate * 100).toFixed(6)),
    voteCountNullRatePct: Number((voteCoverage.voteCountNullRate * 100).toFixed(6)),
    overviewCoveragePct: toPct(total - missingOverview.length),
    keywordsCoveragePct: toPct(total - missingKeywords.length),
    sampleMissingTmdbIds: {
      credits: missingCredits.slice(0, 10).map((movie) => movie.tmdbId),
      runtime: missingRuntime.slice(0, 10).map((movie) => movie.tmdbId),
      voteCountNull: voteCoverage.nullTmdbIds.slice(0, 10),
      voteCountZero: voteCoverage.zeroTmdbIds.slice(0, 10),
      overview: missingOverview.slice(0, 10).map((movie) => movie.tmdbId),
      keywords: missingKeywords.slice(0, 10).map((movie) => movie.tmdbId),
    },
  };
}

async function main(): Promise<void> {
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) throw new Error('TMDB_API_KEY is required');

  const batchSize = parseIntOption(parseOption(process.argv.slice(2), '--batchSize'), 250);
  const startOffset = parseIntOption(parseOption(process.argv.slice(2), '--startOffset'), 0);
  const maxRetries = parseIntOption(parseOption(process.argv.slice(2), '--maxRetries'), 4);
  const resetProgress = process.argv.includes('--resetProgress');
  const scope = parseScopeOption(parseOption(process.argv.slice(2), '--scope'));
  const fields = parseFieldsOption(parseOption(process.argv.slice(2), '--fields'));
  const progressPath = buildProgressPath(fields);
  const sortedFields = toSortedFieldList(fields);

  const prisma = new PrismaClient();
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const bucketBIds = scope === 'bucketB' ? await readBucketBMovieIds() : new Set<string>();
    const before = await gatherCoverage(prisma);
    await writeFile(BEFORE_PATH, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: 'backfill-season1-metadata',
      scope,
      fields: sortedFields,
      bucketBCount: bucketBIds.size,
      coverage: before,
    }, null, 2)}\n`, 'utf8');

    const movies = await prisma.movie.findMany({
      where: scope === 'all'
        ? { tmdbId: { gt: 0 } }
        : {
          tmdbId: { gt: 0 },
          id: { in: [...bucketBIds] },
        },
      select: {
        id: true,
        tmdbId: true,
        title: true,
        synopsis: true,
        director: true,
        castTop: true,
        keywords: true,
        ratings: { select: { source: true, value: true } },
      },
      orderBy: [{ tmdbId: 'asc' }],
    });

    const isMissingMetadata = (movie: typeof movies[number]): boolean => {
      const missingCredits = !(movie.director && movie.director.trim().length > 0) || parseCastNames(movie.castTop).length === 0;
      const missingOverview = !(typeof movie.synopsis === 'string' && movie.synopsis.trim().length > 0);
      const missingKeywords = parseJsonStringArray(movie.keywords).length === 0;
      const missingRuntime = !movie.ratings.some((rating) => rating.source === 'TMDB_RUNTIME' && rating.value > 0);
      const missingVoteCount = !movie.ratings.some((rating) => rating.source === 'TMDB_VOTE_COUNT' && rating.value > 0);
      return (fields.has('credits') && missingCredits)
        || (fields.has('overview') && missingOverview)
        || (fields.has('keywords') && missingKeywords)
        || (fields.has('runtime') && missingRuntime)
        || (fields.has('voteCount') && missingVoteCount);
    };
    const candidates = movies.filter(isMissingMetadata);

    const existingProgress = resetProgress ? null : await readProgressAt(progressPath);
    const processedSet = new Set<string>(existingProgress?.processedMovieIds ?? []);
    const failed = [...(existingProgress?.failed ?? [])];
    const cursorTmdbId = existingProgress?.cursorTmdbId ?? null;

    const pending = candidates
      .filter((movie) => !processedSet.has(movie.id))
      .filter((movie) => (cursorTmdbId === null ? true : movie.tmdbId > cursorTmdbId))
      .slice(startOffset, startOffset + batchSize);

    const progress: BackfillProgress = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      processedMovieIds: [...processedSet],
      cursorTmdbId,
      failed,
    };

    let updatedMovieRows = 0;
    let updatedRatingRows = 0;
    const changedFieldCounts: Record<string, number> = {
      overview: 0,
      director: 0,
      castTop: 0,
      keywords: 0,
      runtime: 0,
      voteCount: 0,
    };

    for (const movie of pending) {
      const url = buildTmdbSeason1MetadataBackfillUrl({ tmdbId: movie.tmdbId, apiKey });
      try {
        const response = await fetchWithRetry(url, maxRetries);
        if (!response.ok) {
          failed.push({ movieId: movie.id, tmdbId: movie.tmdbId, reason: `http_${response.status}` });
          continue;
        }
        const payload = await response.json() as TmdbMetadataBackfillPayload;
        const parsed = parseTmdbMetadataBackfill(payload);
        const updates = buildSeason1MetadataUpdate({
          movieId: movie.id,
          existing: {
            synopsis: movie.synopsis,
            director: movie.director,
            castTop: movie.castTop,
            keywords: movie.keywords,
            ratings: movie.ratings,
          },
          parsed,
        });

        const scopedMovieData: Record<string, unknown> = {};
        if (fields.has('overview') && typeof updates.movieData.synopsis === 'string') {
          scopedMovieData.synopsis = updates.movieData.synopsis;
        }
        if (fields.has('credits') && typeof updates.movieData.director === 'string') {
          scopedMovieData.director = updates.movieData.director;
        }
        if (fields.has('credits') && Array.isArray(updates.movieData.castTop)) {
          scopedMovieData.castTop = updates.movieData.castTop;
        }
        if (fields.has('keywords') && Array.isArray(updates.movieData.keywords)) {
          scopedMovieData.keywords = updates.movieData.keywords;
        }

        if (Object.keys(scopedMovieData).length > 0) {
          await prisma.movie.update({
            where: { id: movie.id },
            data: scopedMovieData,
          });
          updatedMovieRows += 1;
        }
        if (fields.has('runtime') && updates.runtimeUpsert) {
          await prisma.movieRating.upsert(updates.runtimeUpsert);
          updatedRatingRows += 1;
        }
        for (const upsert of (fields.has('voteCount') ? updates.voteUpserts : [])) {
          await prisma.movieRating.upsert(upsert);
          updatedRatingRows += 1;
        }
        for (const field of updates.changedFields) {
          changedFieldCounts[field] = (changedFieldCounts[field] ?? 0) + 1;
        }
      } catch (error) {
        failed.push({
          movieId: movie.id,
          tmdbId: movie.tmdbId,
          reason: error instanceof Error ? error.message : String(error),
        });
      } finally {
        processedSet.add(movie.id);
        progress.cursorTmdbId = movie.tmdbId;
      }
    }

    progress.updatedAt = new Date().toISOString();
    progress.processedMovieIds = [...processedSet];
    progress.failed = failed.slice(-10_000);
    await writeProgressAt(progressPath, progress);

    const after = await gatherCoverage(prisma);
    await writeFile(AFTER_PATH, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: 'backfill-season1-metadata',
      coverage: after,
    }, null, 2)}\n`, 'utf8');

    const coverageMovies = await prisma.movie.findMany({
      where: { tmdbId: { gt: 0 } },
      select: {
        tmdbId: true,
        director: true,
        castTop: true,
        ratings: { select: { source: true, value: true, rawValue: true } },
      },
    });
    const gateCoverage = computeCoverageGateMetrics(coverageMovies, 10);
    const updatedCoverage = {
      generatedAt: new Date().toISOString(),
      options: { batchSize, startOffset, maxRetries, resetProgress, scope, fields: sortedFields },
      counts: {
        bucketBIds: bucketBIds.size,
        totalCandidates: candidates.length,
        processedThisRun: pending.length,
        updatedMovieRows,
        updatedRatingRows,
        failedThisRun: progress.failed.length,
        remainingCandidates: Math.max(0, candidates.length - progress.processedMovieIds.length),
      },
      changedFieldCounts,
      before,
      after,
      deltaPct: {
        credits: Number((after.creditsCoveragePct - before.creditsCoveragePct).toFixed(6)),
        runtime: Number((after.runtimeCoveragePct - before.runtimeCoveragePct).toFixed(6)),
        voteCountFieldPresence: Number((after.voteCountFieldPresencePct - before.voteCountFieldPresencePct).toFixed(6)),
        voteCountPositiveCoverage: Number((after.voteCountPositiveCoveragePct - before.voteCountPositiveCoveragePct).toFixed(6)),
        overview: Number((after.overviewCoveragePct - before.overviewCoveragePct).toFixed(6)),
        keywords: Number((after.keywordsCoveragePct - before.keywordsCoveragePct).toFixed(6)),
      },
      gateCoverage,
      paths: {
        before: BEFORE_PATH,
        after: AFTER_PATH,
        updatedCoverage: COVERAGE_PATH,
        progress: progressPath,
      },
    };
    await writeFile(COVERAGE_PATH, `${JSON.stringify(updatedCoverage, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(updatedCoverage, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('backfill-season1-metadata failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
