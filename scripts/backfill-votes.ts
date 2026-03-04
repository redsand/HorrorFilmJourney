import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ensureLocalDatabaseOrThrow, parseOption } from './catalog-release-utils';
import {
  buildTmdbVoteBackfillUrl,
  buildVoteRatingUpserts,
  parseTmdbVoteMetrics,
  type TmdbVotePayload,
} from '../src/lib/tmdb/vote-backfill';

type VotesProgress = {
  schemaVersion: 1;
  updatedAt: string;
  totalCandidates: number;
  processedMovieIds: string[];
  failed: Array<{ movieId: string; tmdbId: number; reason: string }>;
};

type VoteCoverage = {
  totalTmdbMovies: number;
  withVoteCount: number;
  withVoteAverage: number;
  withPopularity: number;
  withVoteCountAndAverage: number;
  pctVoteCount: number;
  pctVoteAverage: number;
  pctVoteCountAndAverage: number;
};

const PROGRESS_PATH = resolve('artifacts/backfill-votes-progress.json');

function parseIntOption(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(6));
}

async function readProgress(): Promise<VotesProgress | null> {
  try {
    const raw = await readFile(PROGRESS_PATH, 'utf8');
    return JSON.parse(raw) as VotesProgress;
  } catch {
    return null;
  }
}

async function writeProgress(progress: VotesProgress): Promise<void> {
  await mkdir(resolve('artifacts'), { recursive: true });
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

async function computeCoverage(prisma: PrismaClient): Promise<VoteCoverage> {
  const totalTmdbMovies = await prisma.movie.count({ where: { tmdbId: { gt: 0 } } });
  const [voteCountRows, voteAverageRows, popularityRows] = await Promise.all([
    prisma.movieRating.findMany({
      where: { source: 'TMDB_VOTE_COUNT', value: { gt: 0 } },
      select: { movieId: true },
      distinct: ['movieId'],
    }),
    prisma.movieRating.findMany({
      where: { source: 'TMDB', value: { gt: 0 } },
      select: { movieId: true },
      distinct: ['movieId'],
    }),
    prisma.movieRating.findMany({
      where: { source: 'TMDB_POPULARITY', value: { gt: 0 } },
      select: { movieId: true },
      distinct: ['movieId'],
    }),
  ]);
  const voteCountSet = new Set(voteCountRows.map((row) => row.movieId));
  const voteAverageSet = new Set(voteAverageRows.map((row) => row.movieId));
  const withVoteCountAndAverage = [...voteCountSet].filter((movieId) => voteAverageSet.has(movieId)).length;
  return {
    totalTmdbMovies,
    withVoteCount: voteCountSet.size,
    withVoteAverage: voteAverageSet.size,
    withPopularity: new Set(popularityRows.map((row) => row.movieId)).size,
    withVoteCountAndAverage,
    pctVoteCount: toPct(voteCountSet.size, totalTmdbMovies),
    pctVoteAverage: toPct(voteAverageSet.size, totalTmdbMovies),
    pctVoteCountAndAverage: toPct(withVoteCountAndAverage, totalTmdbMovies),
  };
}

async function main(): Promise<void> {
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is required');
  }

  const batchSize = parseIntOption(parseOption(process.argv.slice(2), '--batchSize'), 1000);
  const maxRetries = parseIntOption(parseOption(process.argv.slice(2), '--maxRetries'), 4);
  const resetProgress = process.argv.includes('--resetProgress');

  const prisma = new PrismaClient();
  try {
    const beforeCoverage = await computeCoverage(prisma);

    const movies = await prisma.movie.findMany({
      where: { tmdbId: { gt: 0 } },
      select: {
        id: true,
        tmdbId: true,
        ratings: {
          where: { source: { in: ['TMDB', 'TMDB_VOTE_COUNT', 'TMDB_POPULARITY'] } },
          select: { source: true, value: true },
        },
      },
      orderBy: [{ tmdbId: 'asc' }],
    });

    const candidates = movies.filter((movie) => {
      const tmdbVoteAverage = movie.ratings.find((rating) => rating.source === 'TMDB')?.value ?? 0;
      const tmdbVoteCount = movie.ratings.find((rating) => rating.source === 'TMDB_VOTE_COUNT')?.value ?? 0;
      return !(tmdbVoteAverage > 0 && tmdbVoteCount > 0);
    });

    const existingProgress = resetProgress ? null : await readProgress();
    const processedSet = new Set<string>(existingProgress?.processedMovieIds ?? []);
    const failed = [...(existingProgress?.failed ?? [])];
    const toProcess = candidates.filter((movie) => !processedSet.has(movie.id)).slice(0, batchSize);

    const progress: VotesProgress = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      processedMovieIds: [...processedSet],
      failed,
    };

    let updatedThisRun = 0;
    for (const movie of toProcess) {
      const hasPopularity = movie.ratings.some((rating) => rating.source === 'TMDB_POPULARITY' && rating.value > 0);
      const url = buildTmdbVoteBackfillUrl({ tmdbId: movie.tmdbId, apiKey });
      try {
        const response = await fetchWithRetry(url, maxRetries);
        if (!response.ok) {
          failed.push({ movieId: movie.id, tmdbId: movie.tmdbId, reason: `http_${response.status}` });
          processedSet.add(movie.id);
          continue;
        }

        const payload = await response.json() as TmdbVotePayload;
        const metrics = parseTmdbVoteMetrics(payload);
        if (metrics.voteAverage === null && metrics.voteCount === null) {
          failed.push({ movieId: movie.id, tmdbId: movie.tmdbId, reason: 'missing_vote_metrics' });
          processedSet.add(movie.id);
          continue;
        }

        const upserts = buildVoteRatingUpserts({
          movieId: movie.id,
          metrics,
          includePopularity: !hasPopularity,
        });
        for (const upsert of upserts) {
          // eslint-disable-next-line no-await-in-loop
          await prisma.movieRating.upsert(upsert);
        }
        updatedThisRun += 1;
      } catch (error) {
        failed.push({
          movieId: movie.id,
          tmdbId: movie.tmdbId,
          reason: error instanceof Error ? error.message : String(error),
        });
      } finally {
        processedSet.add(movie.id);
      }
    }

    progress.updatedAt = new Date().toISOString();
    progress.processedMovieIds = [...processedSet];
    progress.failed = failed.slice(-10_000);
    await writeProgress(progress);

    const afterCoverage = await computeCoverage(prisma);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = resolve(`artifacts/backfill-votes-report-${timestamp}.json`);
    const report = {
      generatedAt: new Date().toISOString(),
      options: { batchSize, maxRetries, resetProgress },
      processedThisRun: toProcess.length,
      updatedThisRun,
      remainingCandidates: Math.max(0, candidates.length - progress.processedMovieIds.length),
      totalCandidates: candidates.length,
      beforeCoverage,
      afterCoverage,
      deltaPctVoteCountAndAverage: Number((afterCoverage.pctVoteCountAndAverage - beforeCoverage.pctVoteCountAndAverage).toFixed(6)),
      progressPath: PROGRESS_PATH,
      reportPath,
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('backfill-votes failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

