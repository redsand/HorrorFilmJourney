import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ensureLocalDatabaseOrThrow, parseOption } from './catalog-release-utils';
import { buildTmdbCreditsBackfillUrl, parseTmdbCredits } from '../src/lib/tmdb/credits-backfill';

type BackfillProgress = {
  schemaVersion: 1;
  updatedAt: string;
  totalCandidates: number;
  processedMovieIds: string[];
  cursorTmdbId: number | null;
  failed: Array<{ movieId: string; tmdbId: number; reason: string }>;
};

type Coverage = {
  totalTmdbMovies: number;
  withDirector: number;
  withCastTop: number;
  withDirectorAndCastTop: number;
  pctDirectorAndCastTop: number;
};

type TmdbMovieDetails = {
  credits?: {
    cast?: Array<{ name?: string; character?: string }>;
    crew?: Array<{ name?: string; job?: string }>;
  };
};

const BACKFILLS_DIR = resolve('artifacts/backfills');
const PROGRESS_PATH = resolve(BACKFILLS_DIR, 'credits-progress.json');
const COVERAGE_BEFORE_PATH = resolve(BACKFILLS_DIR, 'credits-coverage-before.json');
const COVERAGE_AFTER_PATH = resolve(BACKFILLS_DIR, 'credits-coverage-after.json');

function parseIntOption(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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

function isMissingCredits(movie: { director: string | null; castTop: unknown }): boolean {
  const directorMissing = !movie.director || movie.director.trim().length === 0;
  const castMissing = parseCastNames(movie.castTop).length === 0;
  return directorMissing || castMissing;
}

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(6));
}

async function readProgress(): Promise<BackfillProgress | null> {
  try {
    const raw = await readFile(PROGRESS_PATH, 'utf8');
    return JSON.parse(raw) as BackfillProgress;
  } catch {
    return null;
  }
}

async function writeProgress(progress: BackfillProgress): Promise<void> {
  await mkdir(BACKFILLS_DIR, { recursive: true });
  await writeFile(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
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

async function computeCoverage(prisma: PrismaClient): Promise<Coverage> {
  const movies = await prisma.movie.findMany({
    where: { tmdbId: { gt: 0 } },
    select: { director: true, castTop: true },
  });
  const withDirector = movies.filter((movie) => Boolean(movie.director && movie.director.trim().length > 0)).length;
  const withCastTop = movies.filter((movie) => parseCastNames(movie.castTop).length > 0).length;
  const withDirectorAndCastTop = movies.filter((movie) =>
    Boolean(movie.director && movie.director.trim().length > 0) && parseCastNames(movie.castTop).length > 0).length;
  return {
    totalTmdbMovies: movies.length,
    withDirector,
    withCastTop,
    withDirectorAndCastTop,
    pctDirectorAndCastTop: toPct(withDirectorAndCastTop, movies.length),
  };
}

async function main(): Promise<void> {
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is required');
  }

  const batchSize = parseIntOption(parseOption(process.argv.slice(2), '--batchSize'), 250);
  const startOffset = parseIntOption(parseOption(process.argv.slice(2), '--startOffset'), 0);
  const maxRetries = parseIntOption(parseOption(process.argv.slice(2), '--maxRetries'), 4);
  const resetProgress = process.argv.includes('--resetProgress');

  const prisma = new PrismaClient();
  try {
    const beforeCoverage = await computeCoverage(prisma);
    await mkdir(BACKFILLS_DIR, { recursive: true });
    await writeFile(COVERAGE_BEFORE_PATH, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      coverage: beforeCoverage,
    }, null, 2)}\n`, 'utf8');

    const rawCandidates = await prisma.movie.findMany({
      where: { tmdbId: { gt: 0 } },
      select: { id: true, tmdbId: true, director: true, castTop: true, title: true, year: true },
      orderBy: [{ tmdbId: 'asc' }],
    });
    const candidates = rawCandidates.filter((movie) => isMissingCredits(movie));

    const existingProgress = resetProgress ? null : await readProgress();
    const processedSet = new Set<string>(existingProgress?.processedMovieIds ?? []);
    const failed = [...(existingProgress?.failed ?? [])];
    const cursorTmdbId = existingProgress?.cursorTmdbId ?? null;
    const pending = candidates
      .filter((movie) => !processedSet.has(movie.id))
      .filter((movie) => (cursorTmdbId === null ? true : movie.tmdbId > cursorTmdbId));
    const toProcess = pending.slice(startOffset, startOffset + batchSize);

    const progress: BackfillProgress = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      processedMovieIds: [...processedSet],
      cursorTmdbId,
      failed,
    };

    let updatedCount = 0;
    for (const movie of toProcess) {
        const url = buildTmdbCreditsBackfillUrl({
          tmdbId: movie.tmdbId,
          apiKey,
        });
      try {
        const response = await fetchWithRetry(url, maxRetries);
        if (!response.ok) {
          failed.push({
            movieId: movie.id,
            tmdbId: movie.tmdbId,
            reason: `http_${response.status}`,
          });
          processedSet.add(movie.id);
          continue;
        }
        const payload = await response.json() as TmdbMovieDetails;
        const { director, castTop } = parseTmdbCredits(payload, 8);
        await prisma.movie.update({
          where: { id: movie.id },
          data: {
            director: director ?? movie.director ?? null,
            castTop: castTop.length > 0 ? castTop : movie.castTop,
          },
        });
        updatedCount += 1;
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
    await writeProgress(progress);

    const afterCoverage = await computeCoverage(prisma);
    await writeFile(COVERAGE_AFTER_PATH, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      coverage: afterCoverage,
    }, null, 2)}\n`, 'utf8');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = resolve(`artifacts/backfill-credits-report-${timestamp}.json`);
    const report = {
      generatedAt: new Date().toISOString(),
      options: { batchSize, startOffset, maxRetries, resetProgress },
      processedThisRun: toProcess.length,
      updatedThisRun: updatedCount,
      remainingCandidates: Math.max(0, pending.length - (startOffset + toProcess.length)),
      totalCandidates: candidates.length,
      beforeCoverage,
      afterCoverage,
      deltaPctDirectorAndCastTop: Number((afterCoverage.pctDirectorAndCastTop - beforeCoverage.pctDirectorAndCastTop).toFixed(6)),
      progressPath: PROGRESS_PATH,
      coverageBeforePath: COVERAGE_BEFORE_PATH,
      coverageAfterPath: COVERAGE_AFTER_PATH,
      reportPath,
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('backfill-credits failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
