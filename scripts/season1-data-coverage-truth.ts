import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { computeVoteCountCoverageBreakdown } from '../src/lib/metrics/catalog-coverage';

type CoverageReason = {
  count: number;
  sampleTmdbIds: number[];
};

type BackfillMismatch = {
  flagged: boolean;
  message: string;
  latestBackfillPath: string | null;
  remainingCandidates: number | null;
  thresholds: {
    runtimeCoverageMin: number;
    voteCountCoverageMin: number;
    creditsCoverageMin: number;
  };
};

const RUNTIME_COVERAGE_MIN = 0.95;
const VOTE_COVERAGE_MIN = 0.9;
const CREDITS_COVERAGE_MIN = 0.85;

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

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(6));
}

function sampleIds(ids: number[], limit = 20): number[] {
  return ids.slice(0, limit);
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = resolve('artifacts/season1/data-coverage-truth', stamp);
    await mkdir(outDir, { recursive: true });

    const movies = await prisma.movie.findMany({
      select: {
        tmdbId: true,
        director: true,
        castTop: true,
        ratings: {
          select: {
            source: true,
            value: true,
            rawValue: true,
          },
        },
      },
      orderBy: { tmdbId: 'asc' },
    });

    const totalMovies = movies.length;
    const withTmdbId = movies.filter((movie) => Number.isInteger(movie.tmdbId) && movie.tmdbId > 0);
    const canonicalUniverse = withTmdbId.length;

    const missingTmdbIdIds = movies
      .filter((movie) => !(Number.isInteger(movie.tmdbId) && movie.tmdbId > 0))
      .map((movie) => movie.tmdbId);

    const runtimeMissingRatingIds: number[] = [];
    const runtimeZeroFromTmdbIds: number[] = [];
    const runtimeNonPositiveInvalidIds: number[] = [];
    const voteMissingRatingIds: number[] = [];
    const voteZeroFromTmdbIds: number[] = [];
    const voteNonPositiveInvalidIds: number[] = [];
    const creditsMissingIds: number[] = [];

    for (const movie of withTmdbId) {
      const runtime = movie.ratings.find((rating) => rating.source.toUpperCase() === 'TMDB_RUNTIME') ?? null;
      const votes = movie.ratings.find((rating) => rating.source.toUpperCase() === 'TMDB_VOTE_COUNT') ?? null;

      if (!runtime) {
        runtimeMissingRatingIds.push(movie.tmdbId);
      } else if (!Number.isFinite(runtime.value) || runtime.value < 0) {
        runtimeNonPositiveInvalidIds.push(movie.tmdbId);
      } else if (runtime.value === 0) {
        runtimeZeroFromTmdbIds.push(movie.tmdbId);
      }

      if (!votes) {
        voteMissingRatingIds.push(movie.tmdbId);
      } else if (!Number.isFinite(votes.value) || votes.value < 0) {
        voteNonPositiveInvalidIds.push(movie.tmdbId);
      } else if (votes.value === 0) {
        voteZeroFromTmdbIds.push(movie.tmdbId);
      }

      const hasDirector = typeof movie.director === 'string' && movie.director.trim().length > 0;
      const hasCast = parseCastNames(movie.castTop).length > 0;
      if (!(hasDirector && hasCast)) {
        creditsMissingIds.push(movie.tmdbId);
      }
    }

    const runtimePresent = canonicalUniverse - runtimeMissingRatingIds.length - runtimeZeroFromTmdbIds.length - runtimeNonPositiveInvalidIds.length;
    const voteBreakdown = computeVoteCountCoverageBreakdown(
      withTmdbId.map((movie) => ({
        tmdbId: movie.tmdbId,
        ratings: movie.ratings.map((rating) => ({ source: rating.source, value: rating.value })),
      })),
    );
    const votePresent = voteBreakdown.voteCountPositive;
    const voteFieldPresent = voteBreakdown.voteCountFieldPresent;
    const creditsPresent = canonicalUniverse - creditsMissingIds.length;

    const coverageTruth = {
      generatedAt: new Date().toISOString(),
      denominator: {
        totalMovies,
        canonicalTmdbMovies: canonicalUniverse,
      },
      canonicalCoverage: {
        runtimeCoveragePct: toPct(runtimePresent, canonicalUniverse),
        tmdbVoteCountFieldPresencePct: Number((voteBreakdown.voteCountFieldPresence * 100).toFixed(6)),
        tmdbVoteCountPositiveCoveragePct: Number((voteBreakdown.voteCountPositiveCoverage * 100).toFixed(6)),
        tmdbVoteCountZeroRatePct: Number((voteBreakdown.voteCountZeroRate * 100).toFixed(6)),
        tmdbVoteCountNullRatePct: Number((voteBreakdown.voteCountNullRate * 100).toFixed(6)),
        creditsCoveragePct: toPct(creditsPresent, canonicalUniverse),
      },
      canonicalCounts: {
        runtimePresent,
        tmdbVoteCountFieldPresent: voteFieldPresent,
        tmdbVoteCountPositivePresent: votePresent,
        creditsPresent,
      },
    };

    const missingReasons = {
      generatedAt: new Date().toISOString(),
      note: 'Coverage uses canonical DB fields only: MovieRating sources TMDB_RUNTIME/TMDB_VOTE_COUNT and Movie.director+castTop.',
      reasons: {
        missing_tmdb_id: {
          count: missingTmdbIdIds.length,
          sampleTmdbIds: sampleIds(missingTmdbIdIds),
        } satisfies CoverageReason,
        runtime_missing_rating_row: {
          count: runtimeMissingRatingIds.length,
          sampleTmdbIds: sampleIds(runtimeMissingRatingIds),
        } satisfies CoverageReason,
        runtime_zero_from_tmdb: {
          count: runtimeZeroFromTmdbIds.length,
          sampleTmdbIds: sampleIds(runtimeZeroFromTmdbIds),
        } satisfies CoverageReason,
        runtime_invalid_negative: {
          count: runtimeNonPositiveInvalidIds.length,
          sampleTmdbIds: sampleIds(runtimeNonPositiveInvalidIds),
        } satisfies CoverageReason,
        voteCount_missing_rating_row: {
          count: voteBreakdown.voteCountNull,
          sampleTmdbIds: sampleIds(voteBreakdown.nullTmdbIds),
        } satisfies CoverageReason,
        voteCount_zero_from_tmdb: {
          count: voteBreakdown.voteCountZero,
          sampleTmdbIds: sampleIds(voteBreakdown.zeroTmdbIds),
        } satisfies CoverageReason,
        voteCount_invalid_negative: {
          count: voteNonPositiveInvalidIds.length,
          sampleTmdbIds: sampleIds(voteNonPositiveInvalidIds),
        } satisfies CoverageReason,
        credits_missing_director_or_cast: {
          count: creditsMissingIds.length,
          sampleTmdbIds: sampleIds(creditsMissingIds),
        } satisfies CoverageReason,
        non_movie_media_type: {
          count: 0,
          sampleTmdbIds: [],
        } satisfies CoverageReason,
      },
      structuralLimitations: [
        'non_movie_media_type is not directly stored on Movie, so this reason cannot be reliably classified from local schema alone.',
      ],
    };

    const latestBackfillPath = resolve('artifacts/backfills/metadata-backfill/updatedCoverage.json');
    const latestBackfill = await readJsonIfExists(latestBackfillPath) as {
      counts?: { remainingCandidates?: number };
      options?: { fields?: string[] };
    } | null;
    const remainingCandidates = latestBackfill?.counts?.remainingCandidates ?? null;

    const runtimeCoverage = coverageTruth.canonicalCoverage.runtimeCoveragePct / 100;
    const voteCoverage = coverageTruth.canonicalCoverage.tmdbVoteCountPositiveCoveragePct / 100;
    const creditsCoverage = coverageTruth.canonicalCoverage.creditsCoveragePct / 100;
    const belowExpected = runtimeCoverage < RUNTIME_COVERAGE_MIN
      || voteCoverage < VOTE_COVERAGE_MIN
      || creditsCoverage < CREDITS_COVERAGE_MIN;
    const flagged = remainingCandidates === 0 && belowExpected;

    const mismatch: BackfillMismatch = {
      flagged,
      message: flagged
        ? 'Backfill reported remainingCandidates=0, but canonical DB coverage is still below expected thresholds. Verify backfill candidate logic and source mapping. Backfill reads/writes MovieRating sources TMDB_RUNTIME/TMDB_VOTE_COUNT and Movie.director/castTop.'
        : 'No mismatch flag triggered.',
      latestBackfillPath: latestBackfill ? latestBackfillPath : null,
      remainingCandidates,
      thresholds: {
        runtimeCoverageMin: RUNTIME_COVERAGE_MIN,
        voteCountCoverageMin: VOTE_COVERAGE_MIN,
        creditsCoverageMin: CREDITS_COVERAGE_MIN,
      },
    };

    const coverageTruthPath = resolve(outDir, 'coverage-truth.json');
    const missingReasonsPath = resolve(outDir, 'missing-reasons.json');
    await writeFile(coverageTruthPath, `${JSON.stringify({ ...coverageTruth, mismatch }, null, 2)}\n`, 'utf8');
    await writeFile(missingReasonsPath, `${JSON.stringify(missingReasons, null, 2)}\n`, 'utf8');

    console.log(JSON.stringify({
      outputDir: outDir,
      coverageTruthPath,
      missingReasonsPath,
      coverage: coverageTruth.canonicalCoverage,
      mismatch,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('season1-data-coverage-truth failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
