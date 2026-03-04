import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ensureLocalDatabaseOrThrow } from './catalog-release-utils.ts';
import { SEASON1_NODE_GOVERNANCE_CONFIG } from '../src/config/seasons/season1-node-governance.ts';
import { evaluateCurriculumEligibility } from '../src/lib/curriculum/eligibility.ts';
import {
  computeCoverageGateMetrics,
  type CoverageGateMetrics,
} from '../src/lib/verification/catalog-coverage-gate.ts';
import { computeJourneyWorthiness } from '../src/lib/journey/journey-worthiness.ts';
import { loadSeasonJourneyWorthinessConfig } from '../src/config/seasons/journey-worthiness.ts';
import { evaluateSeason1PrepublishGate } from '../src/lib/verification/season1-prepublish-gate.ts';
import {
  normalizeTitle,
  toEssentialLookupKeys,
  type Season1EssentialFixtureEntry,
} from '../src/lib/verification/season1-essentials-gate.ts';

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
};

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const COVERAGE_THRESHOLDS = {
  runtimeCoverageMin: 0.9,
  voteCountCoverageMin: 0.9,
  directorAndCastTopCoverageMin: 0.85,
  receptionCountCoverageMin: 0.8,
  topByVotesCoverageMin: 80,
  topByHybridCoverageMin: 90,
} as const;

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function parseCli(argv: string[]): { allowShrink: boolean; allowShrinkReason: string | null } {
  let allowShrink = false;
  let allowShrinkReason: string | null = null;
  for (const arg of argv) {
    if (arg === '--allowShrink') {
      allowShrink = true;
      continue;
    }
    if (arg.startsWith('--allowShrinkReason=')) {
      allowShrinkReason = arg.slice('--allowShrinkReason='.length).trim();
    }
  }
  return { allowShrink, allowShrinkReason };
}

function toPairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function parseFixture(raw: string): Season1EssentialFixtureEntry[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid season1 essentials fixture: expected array');
  }
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Invalid season1 essentials fixture entry at index ${index}`);
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.title !== 'string' || !Number.isInteger(row.year)) {
      throw new Error(`Invalid season1 essentials fixture entry at index ${index}: title/year required`);
    }
    return {
      title: row.title,
      year: row.year as number,
      ...(typeof row.altTitle === 'string' ? { altTitle: row.altTitle } : {}),
      ...(typeof row.tmdbId === 'number' ? { tmdbId: row.tmdbId } : {}),
    };
  });
}

async function runCommandCapture(commandLine: string): Promise<RunResult> {
  return new Promise<RunResult>((resolveRun) => {
    const child = spawn(commandLine, { shell: true, env: process.env });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    child.on('close', (code) => {
      resolveRun({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactsDir = resolve(`artifacts/season1/prepublish/${timestamp}`);
  const auditArtifactsDir = resolve(`${artifactsDir}/audit`);
  const reportPath = resolve('docs/season1-prepublish-report.md');
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(auditArtifactsDir, { recursive: true });

  const checks: CheckResult[] = [];

  const verifyRun = await runCommandCapture('npm run local:verify-catalog');
  await writeFile(
    resolve(artifactsDir, 'verify-log.txt'),
    `${verifyRun.stdout}${verifyRun.stderr ? `\n[stderr]\n${verifyRun.stderr}` : ''}`,
    'utf8',
  );
  checks.push({
    name: 'local:verify-catalog',
    pass: verifyRun.code === 0,
    details: verifyRun.code === 0 ? 'PASS' : `FAIL (exit=${verifyRun.code})`,
  });

  const auditRun = await runCommandCapture(`npx tsx scripts/audit-season1-best-movie-coverage.ts --outputDir=\"${auditArtifactsDir}\"`);
  await writeFile(
    resolve(artifactsDir, 'audit-log.txt'),
    `${auditRun.stdout}${auditRun.stderr ? `\n[stderr]\n${auditRun.stderr}` : ''}`,
    'utf8',
  );
  checks.push({
    name: 'audit:season1:best-coverage',
    pass: auditRun.code === 0,
    details: auditRun.code === 0 ? `PASS (${auditArtifactsDir})` : `FAIL (exit=${auditRun.code})`,
  });

  const prisma = new PrismaClient();
  try {
    const season = await prisma.season.findUnique({
      where: { slug: 'season-1' },
      select: {
        id: true,
        packs: { where: { slug: 'horror' }, select: { id: true } },
      },
    });
    if (!season || season.packs.length === 0) {
      throw new Error('Missing season-1/horror pack');
    }
    const pack = season.packs[0]!;
    const release = await prisma.seasonNodeRelease.findFirst({
      where: { seasonId: season.id, packId: pack.id, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, runId: true, taxonomyVersion: true, createdAt: true, publishedAt: true },
    });
    if (!release) {
      throw new Error('No published season-1 release found');
    }

    const coverageMovies = await prisma.movie.findMany({
      where: { tmdbId: { gt: 0 } },
      select: {
        tmdbId: true,
        director: true,
        castTop: true,
        ratings: { select: { source: true, value: true, rawValue: true } },
      },
    });
    const coverage: CoverageGateMetrics = computeCoverageGateMetrics(coverageMovies, 10);
    const coverageChecks: CheckResult[] = [
      {
        name: 'runtime coverage >= 0.90',
        pass: coverage.runtimeCoverage >= COVERAGE_THRESHOLDS.runtimeCoverageMin,
        details: `${(coverage.runtimeCoverage * 100).toFixed(2)}%`,
      },
      {
        name: 'voteCount coverage >= 0.90',
        pass: coverage.voteCountCoverage >= COVERAGE_THRESHOLDS.voteCountCoverageMin,
        details: `${(coverage.voteCountCoverage * 100).toFixed(2)}%`,
      },
      {
        name: 'credits coverage >= 0.85',
        pass: coverage.directorAndCastTopCoverage >= COVERAGE_THRESHOLDS.directorAndCastTopCoverageMin,
        details: `${(coverage.directorAndCastTopCoverage * 100).toFixed(2)}%`,
      },
      {
        name: 'receptionCount coverage >= 0.80',
        pass: coverage.receptionCountCoverage >= COVERAGE_THRESHOLDS.receptionCountCoverageMin,
        details: `${(coverage.receptionCountCoverage * 100).toFixed(2)}%`,
      },
    ];
    checks.push(...coverageChecks);

    const omissionsToplistsRaw = await readFile(resolve(auditArtifactsDir, 'omissions-toplists.json'), 'utf8');
    const omissionsToplists = JSON.parse(omissionsToplistsRaw) as {
      toplistCoverage: Array<{ name: string; coveragePercentTotalSnapshot: number }>;
    };
    const snapshotSummaryRaw = await readFile(resolve(auditArtifactsDir, 'snapshot-summary.json'), 'utf8');
    const snapshotSummary = JSON.parse(snapshotSummaryRaw) as {
      counts: {
        totalUniqueMovies: number;
        extendedUniqueOnlyMovies?: number;
      };
    };
    const topByVotes = omissionsToplists.toplistCoverage.find((row) => row.name === 'TopByVotes');
    const topByHybrid = omissionsToplists.toplistCoverage.find((row) => row.name === 'TopByHybrid');
    checks.push({
      name: 'TopByVotes coverage (core+extended) >= 0.80',
      pass: (topByVotes?.coveragePercentTotalSnapshot ?? 0) >= COVERAGE_THRESHOLDS.topByVotesCoverageMin,
      details: `${(topByVotes?.coveragePercentTotalSnapshot ?? 0).toFixed(2)}%`,
    });
    checks.push({
      name: 'TopByHybrid coverage (core+extended) >= 0.90',
      pass: (topByHybrid?.coveragePercentTotalSnapshot ?? 0) >= COVERAGE_THRESHOLDS.topByHybridCoverageMin,
      details: `${(topByHybrid?.coveragePercentTotalSnapshot ?? 0).toFixed(2)}%`,
    });

    const journeyConfig = loadSeasonJourneyWorthinessConfig('season-1');
    const journeyMinExtended = journeyConfig.gates?.journeyMinExtended ?? journeyConfig.gates?.journeyMinCore ?? 0.6;
    const journeyMovies = await prisma.movie.findMany({
      where: { tmdbId: { gt: 0 } },
      select: {
        year: true,
        synopsis: true,
        posterUrl: true,
        director: true,
        castTop: true,
        genres: true,
        keywords: true,
        ratings: { select: { source: true, value: true, scale: true } },
      },
    });
    const eligibleForJourney = journeyMovies.filter((movie) => {
      const genres = parseJsonStringArray(movie.genres);
      if (!genres.includes('horror')) return false;
      return evaluateCurriculumEligibility({
        posterUrl: movie.posterUrl,
        director: movie.director,
        castTop: movie.castTop,
        ratings: movie.ratings.map((rating) => ({ source: rating.source })),
        hasStreamingData: false,
      }).isEligible;
    });
    const journeyExtendedPassCount = eligibleForJourney.filter((movie) => {
      const score = computeJourneyWorthiness({
        year: movie.year,
        runtimeMinutes: null,
        popularity: movie.ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? null,
        voteCount: movie.ratings.find((rating) => rating.source === 'TMDB_VOTE_COUNT')?.value
          ?? movie.ratings.find((rating) => rating.source === 'TMDB_VOTES')?.value
          ?? null,
        posterUrl: movie.posterUrl,
        synopsis: movie.synopsis,
        director: movie.director,
        castTop: movie.castTop,
        genres: parseJsonStringArray(movie.genres),
        keywords: parseJsonStringArray(movie.keywords),
        ratings: movie.ratings.map((rating) => ({ source: rating.source, value: rating.value, scale: rating.scale ?? undefined })),
      }, 'season-1').score;
      return score >= journeyMinExtended;
    }).length;

    const prepublishGate = evaluateSeason1PrepublishGate({
      totalUniqueMovies: snapshotSummary.counts.totalUniqueMovies,
      extendedUniqueOnlyMovies: snapshotSummary.counts.extendedUniqueOnlyMovies ?? 0,
      eligiblePoolCount: eligibleForJourney.length,
      journeyExtendedPassCount,
      allowShrink: cli.allowShrink,
      allowShrinkReason: cli.allowShrinkReason,
    });
    checks.push(...prepublishGate.checks);

    const nodeRows = await prisma.nodeMovie.findMany({
      where: {
        node: { packId: pack.id },
        runId: release.runId,
        taxonomyVersion: release.taxonomyVersion,
      },
      select: {
        movieId: true,
        tier: true,
        node: { select: { slug: true } },
      },
    });

    const byMovie = new Map<string, Set<string>>();
    for (const row of nodeRows) {
      const set = byMovie.get(row.movieId) ?? new Set<string>();
      set.add(row.node.slug);
      byMovie.set(row.movieId, set);
    }
    const disallowedHits = SEASON1_NODE_GOVERNANCE_CONFIG.overlapConstraints.disallowedPairs
      .map(([a, b]) => {
        let count = 0;
        for (const slugs of byMovie.values()) {
          if (slugs.has(a) && slugs.has(b)) count += 1;
        }
        return { pair: toPairKey(a, b), count };
      })
      .filter((row) => row.count > 0);
    checks.push({
      name: 'no disallowed overlaps',
      pass: disallowedHits.length === 0,
      details: disallowedHits.length === 0 ? 'PASS' : disallowedHits.map((row) => `${row.pair}:${row.count}`).join(', '),
    });

    const essentials = parseFixture(await readFile(resolve('tests/fixtures/season1-essentials.json'), 'utf8'));
    const assignedMovieIds = new Set(nodeRows.map((row) => row.movieId));
    const allMovies = await prisma.movie.findMany({
      select: { id: true, tmdbId: true, title: true, year: true },
    });
    const byTmdb = new Map(allMovies.map((movie) => [movie.tmdbId, movie] as const));
    const byLookup = new Map<string, typeof allMovies[number][]>();
    for (const movie of allMovies) {
      const key = `${normalizeTitle(movie.title)}::${movie.year ?? -1}`;
      const list = byLookup.get(key) ?? [];
      list.push(movie);
      byLookup.set(key, list);
    }
    const missingEssentials: Array<{ title: string; year: number }> = [];
    for (const essential of essentials) {
      let movie = typeof essential.tmdbId === 'number' ? byTmdb.get(essential.tmdbId) : undefined;
      if (!movie) {
        const candidates = toEssentialLookupKeys(essential).flatMap((key) => byLookup.get(key) ?? []);
        movie = candidates[0];
      }
      if (!movie || !assignedMovieIds.has(movie.id)) {
        missingEssentials.push({ title: essential.title, year: essential.year });
      }
    }
    checks.push({
      name: 'essentials list PASS',
      pass: missingEssentials.length === 0,
      details: missingEssentials.length === 0
        ? 'PASS'
        : `missing=${missingEssentials.length} (first: ${missingEssentials.slice(0, 5).map((row) => `${row.title} (${row.year})`).join('; ')})`,
    });

    const nodeCoreBoundariesRaw = await readFile(resolve(auditArtifactsDir, 'node-core-boundaries.json'), 'utf8');
    const nodeCoreBoundaries = JSON.parse(nodeCoreBoundariesRaw) as {
      nodes: Record<string, { coreCount: number; targetSize: number; capPressure: number; notes?: string }>;
    };
    const underfilledNodes = Object.entries(nodeCoreBoundaries.nodes)
      .filter(([, node]) => node.coreCount < node.targetSize)
      .map(([slug, node]) => ({
        nodeSlug: slug,
        coreCount: node.coreCount,
        targetSize: node.targetSize,
        capPressure: node.capPressure,
        justification: node.capPressure > 0
          ? 'Core constrained by overlap/selection despite deep extended pool.'
          : 'Eligible pool currently below target under quality and journey gates.',
      }));

    const checksPath = resolve(artifactsDir, 'checks.json');
    const coveragePath = resolve(artifactsDir, 'coverage-metrics.json');
    const underfilledPath = resolve(artifactsDir, 'underfilled-nodes.json');
    const summaryPath = resolve(artifactsDir, 'summary.json');
    await writeFile(checksPath, `${JSON.stringify(checks, null, 2)}\n`, 'utf8');
    await writeFile(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`, 'utf8');
    await writeFile(underfilledPath, `${JSON.stringify(underfilledNodes, null, 2)}\n`, 'utf8');

    const pass = checks.every((check) => check.pass);
    const summary = {
      generatedAt: new Date().toISOString(),
      release: {
        id: release.id,
        runId: release.runId,
        taxonomyVersion: release.taxonomyVersion,
        createdAt: release.createdAt.toISOString(),
        publishedAt: release.publishedAt?.toISOString() ?? null,
      },
      pass,
      checks,
      allowShrink: cli.allowShrink,
      allowShrinkReason: cli.allowShrinkReason,
      shrinkGateInputs: {
        totalUniqueMovies: snapshotSummary.counts.totalUniqueMovies,
        extendedUniqueOnlyMovies: snapshotSummary.counts.extendedUniqueOnlyMovies ?? 0,
        eligiblePoolCount: eligibleForJourney.length,
        journeyExtendedPassCount,
      },
      coverage: {
        runtime: coverage.runtimeCoverage,
        voteCount: coverage.voteCountCoverage,
        credits: coverage.directorAndCastTopCoverage,
        reception: coverage.receptionCountCoverage,
      },
      underfilledNodes,
      artifactDir: artifactsDir,
      auditArtifactDir: auditArtifactsDir,
    };
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    const markdown = [
      '# Season 1 Prepublish Report',
      '',
      `Generated: ${summary.generatedAt}`,
      `Artifacts: \`${artifactsDir}\``,
      '',
      '## Snapshot',
      '',
      `- Release ID: \`${release.id}\``,
      `- Run ID: \`${release.runId}\``,
      `- Taxonomy Version: \`${release.taxonomyVersion}\``,
      `- Published At: ${release.publishedAt?.toISOString() ?? 'n/a'}`,
      '',
      '## Gate Results',
      '',
      '| Check | Status | Details |',
      '|---|---|---|',
      ...checks.map((check) => `| ${check.name} | ${check.pass ? 'PASS' : 'FAIL'} | ${check.details} |`),
      '',
      '## Underfilled Nodes (Allowed, Justified)',
      '',
      ...(underfilledNodes.length === 0
        ? ['- none']
        : underfilledNodes.map((node) => `- ${node.nodeSlug}: ${node.coreCount}/${node.targetSize}. ${node.justification}`)),
      '',
      '## Coverage Metrics',
      '',
      `- Runtime: ${(coverage.runtimeCoverage * 100).toFixed(2)}%`,
      `- Vote count: ${(coverage.voteCountCoverage * 100).toFixed(2)}%`,
      `- Credits (director+castTop): ${(coverage.directorAndCastTopCoverage * 100).toFixed(2)}%`,
      `- Reception count: ${(coverage.receptionCountCoverage * 100).toFixed(2)}%`,
      '',
      '## Collapse Guards',
      '',
      `- allowShrink: ${cli.allowShrink ? 'true' : 'false'}`,
      `- allowShrinkReason: ${cli.allowShrinkReason && cli.allowShrinkReason.length > 0 ? cli.allowShrinkReason : 'n/a'}`,
      `- totalUniqueMovies: ${snapshotSummary.counts.totalUniqueMovies}`,
      `- extendedUniqueOnlyMovies: ${snapshotSummary.counts.extendedUniqueOnlyMovies ?? 0}`,
      `- eligiblePoolCount: ${eligibleForJourney.length}`,
      `- journeyExtendedPassCount: ${journeyExtendedPassCount}`,
      '',
      '## Artifact Files',
      '',
      '- `verify-log.txt`',
      '- `audit-log.txt`',
      '- `checks.json`',
      '- `coverage-metrics.json`',
      '- `underfilled-nodes.json`',
      '- `summary.json`',
      '- `audit/*`',
      '',
      `Overall status: **${pass ? 'PASS' : 'FAIL'}**`,
    ].join('\n');
    await writeFile(reportPath, `${markdown}\n`, 'utf8');

    console.log(`[season1:prepublish] ${pass ? 'PASS' : 'FAIL'} artifacts=${artifactsDir} report=${reportPath}`);
    if (!pass) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[season1:prepublish] failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
