import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureLocalDatabaseOrThrow, runCommand, writeVerificationStamp } from './catalog-release-utils';
import { SEASON1_NODE_GOVERNANCE_CONFIG } from '../src/config/seasons/season1-node-governance';
import {
  computeCoverageGateMetrics,
  evaluateCoverageGate,
  type CoverageGateThresholds,
} from '../src/lib/verification/catalog-coverage-gate';
import { evaluateCurriculumEligibility } from '../src/lib/curriculum/eligibility';
import { evaluateJourneyWorthinessSelectionGate } from '../src/lib/journey/journey-worthiness';
import { scoreMovieForNodes } from '../src/lib/nodes/scoring/scoreMovieForNodes';
import { resolvePerNodeQualityFloor } from '../src/lib/nodes/governance/season1-governance';
import {
  formatSeason1EssentialsGateFailure,
  normalizeTitle,
  recommendedFixForReason,
  toEssentialLookupKeys,
  type Season1EssentialFixtureEntry,
  type Season1EssentialMissing,
} from '../src/lib/verification/season1-essentials-gate';

function toPairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
};

const COVERAGE_THRESHOLDS: CoverageGateThresholds = {
  runtimeCoverageMin: 0.9,
  voteCountFieldPresenceMin: 0.9,
  directorAndCastTopCoverageMin: 0.85,
  receptionCountCoverageMin: 0.8,
  sampleSize: 10,
};

function printResult(item: CheckResult): void {
  const status = item.pass ? 'PASS' : 'FAIL';
  console.log(`[local.verify-catalog] ${status} ${item.name} :: ${item.details}`);
}

function printWarning(name: string, details: string): void {
  console.warn(`[local.verify-catalog] WARN ${name} :: ${details}`);
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function parseKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
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

function loadSeason1EssentialsFixture(): Season1EssentialFixtureEntry[] {
  const fixturePath = resolve('tests/fixtures/season1-essentials.json');
  const parsed = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed) || parsed.length < 50) {
    throw new Error(`Invalid essentials fixture at ${fixturePath}: expected at least 50 entries`);
  }
  const entries = parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Invalid essentials fixture entry at index ${index}`);
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.title !== 'string' || !Number.isInteger(row.year)) {
      throw new Error(`Invalid essentials fixture entry at index ${index}: title/year required`);
    }
    return {
      title: row.title,
      year: row.year as number,
      ...(typeof row.altTitle === 'string' ? { altTitle: row.altTitle } : {}),
      ...(typeof row.tmdbId === 'number' ? { tmdbId: row.tmdbId } : {}),
    };
  });
  return entries;
}

async function main(): Promise<void> {
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  const checks: CheckResult[] = [];

  try {
    runCommand('npm run audit:season1:nodes');

    const season = await prisma.season.findUnique({
      where: { slug: 'season-1' },
      select: {
        id: true,
        packs: {
          where: { slug: 'horror' },
          select: {
            id: true,
            nodes: {
              select: {
                slug: true,
                movies: { select: { movieId: true, source: true, tier: true } },
              },
            },
          },
        },
      },
    });
    if (!season || season.packs.length === 0) {
      throw new Error('Season 1 horror pack not found');
    }
    const pack = season.packs[0]!;
    const governance = SEASON1_NODE_GOVERNANCE_CONFIG;

    checks.push({
      name: 'exactly-16-season1-nodes',
      pass: pack.nodes.length === 16,
      details: `found=${pack.nodes.length}`,
    });

    const byMovie = new Map<string, string[]>();
    const sourceByMovie = new Map<string, string[]>();
    const coreByMovie = new Map<string, string[]>();
    const coreSourceByMovie = new Map<string, string[]>();
    for (const node of pack.nodes) {
      for (const assignment of node.movies) {
        const list = byMovie.get(assignment.movieId) ?? [];
        list.push(node.slug);
        byMovie.set(assignment.movieId, list);
        const sourceList = sourceByMovie.get(assignment.movieId) ?? [];
        sourceList.push(assignment.source);
        sourceByMovie.set(assignment.movieId, sourceList);
        if (assignment.tier === 'CORE') {
          const coreList = coreByMovie.get(assignment.movieId) ?? [];
          coreList.push(node.slug);
          coreByMovie.set(assignment.movieId, coreList);
          const coreSourceList = coreSourceByMovie.get(assignment.movieId) ?? [];
          coreSourceList.push(assignment.source);
          coreSourceByMovie.set(assignment.movieId, coreSourceList);
        }
      }
    }

    const tooManyNodesCount = [...coreByMovie.entries()].filter(([movieId, slugs]) => {
      const uniqueCount = new Set(slugs).size;
      if (uniqueCount <= governance.defaults.maxNodesPerMovie) {
        return false;
      }
      const sources = coreSourceByMovie.get(movieId) ?? [];
      return !sources.every((source) => source === 'curated' || source === 'override');
    }).length;
    checks.push({
      name: 'max-nodes-per-movie',
      pass: tooManyNodesCount === 0,
      details: `violations=${tooManyNodesCount} max=${governance.defaults.maxNodesPerMovie} scope=CORE`,
    });

    const disallowedHits = governance.overlapConstraints.disallowedPairs
      .map(([a, b]) => {
        let count = 0;
        for (const slugs of byMovie.values()) {
          const set = new Set(slugs);
          if (set.has(a) && set.has(b)) {
            count += 1;
          }
        }
        return { pair: toPairKey(a, b), count };
      })
      .filter((row) => row.count > 0);
    checks.push({
      name: 'disallowed-overlap-pairs',
      pass: disallowedHits.length === 0,
      details: disallowedHits.length === 0 ? 'no overlaps' : disallowedHits.map((row) => `${row.pair}:${row.count}`).join(', '),
    });

    const horrorMovies = await prisma.movie.findMany({
      select: { id: true, genres: true },
    });
    const horrorCatalog = horrorMovies.filter((movie) => parseGenres(movie.genres).includes('horror'));
    const noNodeCount = horrorCatalog.filter((movie) => !byMovie.has(movie.id)).length;
    const noNodePct = horrorCatalog.length > 0 ? noNodeCount / horrorCatalog.length : 0;
    checks.push({
      name: 'horror-no-node-percent',
      pass: true,
      details: `${(noNodePct * 100).toFixed(2)}% (${noNodeCount}/${horrorCatalog.length})`,
    });

    const published = await prisma.seasonNodeRelease.findFirst({
      where: { seasonId: season.id, packId: pack.id, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, runId: true, taxonomyVersion: true },
    });
    checks.push({
      name: 'published-snapshot-exists',
      pass: Boolean(published),
      details: published ? `release=${published.id}` : 'none',
    });

    if (published) {
      const essentials = loadSeason1EssentialsFixture();
      const assignmentRows = await prisma.nodeMovie.findMany({
        where: {
          node: { packId: pack.id },
          runId: published.runId,
          taxonomyVersion: published.taxonomyVersion,
        },
        select: { movieId: true },
      });
      const assignedMovieIds = new Set(assignmentRows.map((row) => row.movieId));

      const allMovies = await prisma.movie.findMany({
        select: {
          id: true,
          tmdbId: true,
          title: true,
          year: true,
          synopsis: true,
          posterUrl: true,
          genres: true,
          keywords: true,
          director: true,
          castTop: true,
          embedding: { select: { vectorJson: true } },
          ratings: { select: { source: true, value: true, scale: true } },
        },
      });
      const byTmdbId = new Map(allMovies.map((movie) => [movie.tmdbId, movie] as const));
      const byLookupKey = new Map<string, typeof allMovies[number][]>([]);
      for (const movie of allMovies) {
        const key = `${normalizeTitle(movie.title)}::${movie.year ?? -1}`;
        const list = byLookupKey.get(key) ?? [];
        list.push(movie);
        byLookupKey.set(key, list);
      }

      const missing: Season1EssentialMissing[] = [];
      for (const essential of essentials) {
        let movie = typeof essential.tmdbId === 'number' ? byTmdbId.get(essential.tmdbId) : undefined;
        if (!movie) {
          const candidates = toEssentialLookupKeys(essential).flatMap((key) => byLookupKey.get(key) ?? []);
          movie = candidates[0];
        }
        if (!movie) {
          missing.push({
            ...essential,
            reason: 'movie_not_in_catalog',
            recommendedFix: recommendedFixForReason('movie_not_in_catalog'),
            details: ['no local movie record matched title/year'],
          });
          continue;
        }
        if (assignedMovieIds.has(movie.id)) {
          continue;
        }

        const eligibility = evaluateCurriculumEligibility({
          posterUrl: movie.posterUrl,
          director: movie.director,
          castTop: movie.castTop,
          ratings: movie.ratings.map((rating) => ({ source: rating.source })),
          hasStreamingData: false,
        });
        let reason = '';
        const details: string[] = [];
        if (!eligibility.isEligible) {
          if (eligibility.missingCredits) reason = 'missing_credits';
          else if (eligibility.missingRatings) reason = 'missing_ratings';
          else if (eligibility.missingPoster) reason = 'missing_poster';
          else if (eligibility.missingReception) reason = 'missing_reception';
          else reason = 'fails_curriculum_eligibility';
          details.push(
            `missingCredits=${eligibility.missingCredits}`,
            `missingRatings=${eligibility.missingRatings}`,
            `missingPoster=${eligibility.missingPoster}`,
            `missingReception=${eligibility.missingReception}`,
          );
        } else {
          const journey = evaluateJourneyWorthinessSelectionGate({
            year: movie.year,
            runtimeMinutes: null,
            popularity: movie.ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? null,
            voteCount: movie.ratings.find((rating) => rating.source === 'TMDB_VOTE_COUNT')?.value ?? null,
            posterUrl: movie.posterUrl,
            synopsis: movie.synopsis,
            director: movie.director,
            castTop: parseCastNames(movie.castTop),
            genres: parseGenres(movie.genres),
            keywords: parseKeywords(movie.keywords),
            ratings: movie.ratings.map((rating) => ({ source: rating.source, value: rating.value, scale: rating.scale ?? undefined })),
          }, 'season-1');
          if (!journey.pass) {
            const head = journey.result.reasons[0] ?? 'score_below_threshold';
            reason = `journey_gate_fail:${head}`;
            details.push(`journeyScore=${journey.result.score}`, `journeyThreshold=${journey.threshold}`, `journeyReasons=${journey.result.reasons.join(',')}`);
          } else {
            const scores = scoreMovieForNodes({
              seasonId: 'season-1',
              movie: {
                id: movie.id,
                tmdbId: movie.tmdbId,
                title: movie.title,
                year: movie.year,
                genres: parseGenres(movie.genres),
                keywords: parseKeywords(movie.keywords),
                synopsis: movie.synopsis,
              },
              movieEmbedding: Array.isArray(movie.embedding?.vectorJson)
                ? movie.embedding.vectorJson.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
                : undefined,
            });
            const best = scores[0];
            if (!best) {
              reason = 'no_node_scores';
            } else {
              const floor = resolvePerNodeQualityFloor(SEASON1_NODE_GOVERNANCE_CONFIG, best.nodeSlug);
              details.push(`bestNode=${best.nodeSlug}`, `bestScore=${best.finalScore}`, `qualityFloor=${floor}`);
              if (best.finalScore < floor) {
                reason = 'node_score_below_quality_floor';
              } else {
                reason = 'overlap_or_capacity_exclusion';
              }
            }
          }
        }

        missing.push({
          title: essential.title,
          year: essential.year,
          ...(essential.altTitle ? { altTitle: essential.altTitle } : {}),
          ...(typeof essential.tmdbId === 'number' ? { tmdbId: essential.tmdbId } : {}),
          reason,
          recommendedFix: recommendedFixForReason(reason),
          details,
        });
      }

      if (missing.length > 0) {
        console.log('[local.verify-catalog] season1 essentials missing details:');
        missing.slice(0, 30).forEach((entry, index) => {
          console.log(
            `  ${index + 1}. ${entry.title} (${entry.year}) :: ${entry.reason} :: fix=${entry.recommendedFix}`,
          );
        });
      }

      checks.push({
        name: 'season1-essentials-presence-gate',
        pass: missing.length === 0,
        details: formatSeason1EssentialsGateFailure(missing, 12),
      });
    }

    const coverageMovies = await prisma.movie.findMany({
      where: { tmdbId: { gt: 0 } },
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
    });
    const coverageMetrics = computeCoverageGateMetrics(coverageMovies, COVERAGE_THRESHOLDS.sampleSize);
    const coverageGate = evaluateCoverageGate(coverageMetrics, COVERAGE_THRESHOLDS);
    for (const warning of coverageGate.warnings) {
      printWarning('vote-count-zero-rate', warning);
    }
    if (coverageMetrics.directorAndCastTopCoverage < 0.9) {
      printWarning(
        'credits-coverage-recommended-threshold',
        `directorAndCastTopCoverage ${(coverageMetrics.directorAndCastTopCoverage * 100).toFixed(2)}% < 90.00% sampleTmdbIds=[${coverageMetrics.sampleIds.missingDirectorOrCast.join(',')}]`,
      );
    }
    if (coverageMetrics.runtimeCoverage < 0.95) {
      printWarning(
        'runtime-coverage-recommended-threshold',
        `runtimeCoverage ${(coverageMetrics.runtimeCoverage * 100).toFixed(2)}% < 95.00% sampleTmdbIds=[${coverageMetrics.sampleIds.missingRuntime.join(',')}]`,
      );
    }
    const creditsCoveragePass = coverageMetrics.directorAndCastTopCoverage >= COVERAGE_THRESHOLDS.directorAndCastTopCoverageMin;
    const creditsCoverageDetails = creditsCoveragePass
      ? `directorAndCastTopCoverage ${(coverageMetrics.directorAndCastTopCoverage * 100).toFixed(2)}% >= ${(COVERAGE_THRESHOLDS.directorAndCastTopCoverageMin * 100).toFixed(2)}%`
      : `directorAndCastTopCoverage ${(coverageMetrics.directorAndCastTopCoverage * 100).toFixed(2)}% < ${(COVERAGE_THRESHOLDS.directorAndCastTopCoverageMin * 100).toFixed(2)}% sampleTmdbIds=[${coverageMetrics.sampleIds.missingDirectorOrCast.join(',')}]`;
    checks.push({
      name: 'credits-coverage-gate',
      pass: creditsCoveragePass,
      details: creditsCoverageDetails,
    });
    checks.push({
      name: 'coverage-threshold-gate',
      pass: coverageGate.pass,
      details: coverageGate.details,
    });

    runCommand('npm run test -- tests/prisma/season1-node-governance-controls.test.ts tests/prisma/season1-node-regression-gates.test.ts tests/prisma/season1-published-snapshot-read.test.ts tests/prisma/season1-weak-supervision-fixture.test.ts tests/unit/season1-node-classifier.test.ts');
    const packSummary = await prisma.genrePack.findUnique({
      where: { slug: 'horror' },
      select: {
        id: true,
        season: { select: { slug: true } },
        nodeReleases: {
          where: { isPublished: true },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          select: { taxonomyVersion: true, runId: true },
          take: 1,
        },
      },
    });
    const release = packSummary?.nodeReleases[0];
    checks.forEach(printResult);
    const pass = checks.every((item) => item.pass);
    const failedCount = checks.filter((item) => !item.pass).length;
    console.log(`[local.verify-catalog] summary pass=${pass} failed=${failedCount} total=${checks.length}`);

    if (!pass) {
      process.exit(1);
    }

    const stampPath = await writeVerificationStamp({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      taxonomyVersion: release?.taxonomyVersion ?? 'unknown',
      runId: release?.runId ?? 'unknown',
      checks,
    });
    console.log(`[local.verify-catalog] verification stamp written: ${stampPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[local.verify-catalog] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
