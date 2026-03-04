import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { evaluateCurriculumEligibility } from '../src/lib/curriculum/eligibility.ts';
import {
  journeyWorthinessDiagnosticPass as isJourneyWorthinessDiagnosticPass,
  journeyWorthinessSelectionGatePass as isJourneyWorthinessSelectionGatePass,
  type JourneyWorthinessMovieInput,
} from '../src/lib/journey/journey-worthiness.ts';
import { buildSeason1LabelingFunctions, inferNodeProbabilities, type LabelingFunction } from '../src/lib/nodes/weak-supervision/index.ts';
import {
  evaluateGoldSample,
  normalizeTitle,
  type GoldFixture,
} from '../src/lib/audit/season1-node-audit.ts';
import { TMDB_GENRE_NAME_BY_ID, TMDB_HORROR_GENRE_ID } from '../src/lib/tmdb/tmdb-normalization.ts';
import { SEASON1_NODE_GOVERNANCE_CONFIG } from '../src/config/seasons/season1-node-governance.ts';

type CurriculumSpec = {
  seasonSlug: string;
  packSlug: string;
  nodes: Array<{
    slug: string;
    name: string;
    titles: Array<{ title: string; year: number; altTitle?: string }>;
  }>;
};

type CoverageMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  synopsis: string | null;
  genres: string[];
  keywords: string[];
  country: string | null;
  director: string | null;
  castTop: unknown;
  ratings: Array<{ source: string; value: number; scale: string | null }>;
  posterUrl: string;
};

type FunnelRow = {
  stage: string;
  count: number;
  note?: string;
};

type ScenarioResult = {
  name: string;
  uniqueAssignedMovies: number;
  totalAssignments: number;
  nodeSizes: Record<string, number>;
  overlapAnomalies: number;
  hardFixtureMismatches: number;
  fixtureOverlapRate: number;
};

type TieredNodeRow = {
  nodeSlug: string;
  tier: 'CORE' | 'EXTENDED';
  finalScore: number;
};

type SeasonNodeGovernanceConfig = typeof SEASON1_NODE_GOVERNANCE_CONFIG;

function resolvePerNodeThreshold(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.threshold ?? config.defaults.threshold;
}

function resolvePerNodeTargetSize(config: SeasonNodeGovernanceConfig, nodeSlug: string): number {
  return config.nodes[nodeSlug]?.targetSize ?? config.defaults.targetSize;
}

function toPairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function parseCastNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
        return ((entry as { name: string }).name).trim();
      }
      return '';
    })
    .filter((entry) => entry.length > 0);
}

function getPopularity(ratings: CoverageMovie['ratings']): number {
  return ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? 0;
}

function getVoteCount(ratings: CoverageMovie['ratings']): number {
  return (
    ratings.find((rating) => rating.source === 'TMDB_VOTE_COUNT')?.value
    ?? ratings.find((rating) => rating.source === 'TMDB_VOTES')?.value
    ?? 0
  );
}

function toJourneyWorthinessInput(movie: CoverageMovie): JourneyWorthinessMovieInput {
  return {
    year: movie.year,
    runtimeMinutes: null,
    popularity: getPopularity(movie.ratings),
    voteCount: getVoteCount(movie.ratings),
    posterUrl: movie.posterUrl,
    synopsis: movie.synopsis,
    director: movie.director,
    castTop: movie.castTop,
    genres: movie.genres,
    keywords: movie.keywords,
    ratings: movie.ratings.map((rating) => ({
      source: rating.source,
      value: rating.value,
      scale: rating.scale ?? undefined,
    })),
    receptionSources: [],
  };
}

function makeLookupKey(title: string, year: number | null): string {
  return `${normalizeTitle(title)}::${year ?? -1}`;
}

function stableRank(id: string, seed: string): string {
  return createHash('sha256').update(`${seed}:${id}`).digest('hex');
}

function hasHorrorAdjacentSignals(movie: CoverageMovie): boolean {
  const genreSet = new Set(movie.genres);
  const keywordText = movie.keywords.join(' ');
  if (genreSet.has('horror')) {
    return true;
  }
  const adjacentGenre = genreSet.has('thriller') || genreSet.has('mystery') || genreSet.has('sci-fi') || genreSet.has('fantasy');
  if (!adjacentGenre) {
    return false;
  }
  return /\bhorror\b|\boccult\b|\bhaunt|\bghost\b|\bdemon\b|\bzombie\b|\bslasher\b|\bmonster\b|\bsupernatural\b|\bcreepy\b/i.test(keywordText);
}

type SelectionInput = {
  movies: CoverageMovie[];
  spec: CurriculumSpec;
  governance: SeasonNodeGovernanceConfig;
  lfs: LabelingFunction[];
  includeAdjacentGate: boolean;
  thresholdDelta: number;
  targetDelta: number;
  maxNodesPerMovieOverride?: number;
  disableDisallowedPairs: boolean;
};

type SelectionOutput = {
  assignmentsByMovie: Map<string, Set<string>>;
  assignmentCount: number;
  nodeSizes: Record<string, number>;
  dropped: {
    belowThreshold: number;
    nodeTargetCap: number;
    maxNodesPerMovie: number;
    disallowedOverlap: number;
  };
  curatedAnchorsMatched: number;
  eligibleBeforeScoring: number;
  scoringAboveAnyNode: number;
};

function runSelection(input: SelectionInput): SelectionOutput {
  const movieByLookup = new Map(input.movies.map((movie) => [makeLookupKey(movie.title, movie.year), movie] as const));
  const movieById = new Map(input.movies.map((movie) => [movie.id, movie] as const));
  const pool = input.movies.filter((movie) => {
    const hasHorrorGenre = movie.genres.includes('horror');
    if (hasHorrorGenre) {
      return true;
    }
    return input.includeAdjacentGate && hasHorrorAdjacentSignals(movie);
  }).filter((movie) => {
    const eligibility = evaluateCurriculumEligibility({
      posterUrl: movie.posterUrl,
      director: movie.director,
      castTop: movie.castTop,
      ratings: movie.ratings.map((rating) => ({ source: rating.source })),
      hasStreamingData: false,
    });
    return eligibility.isEligible;
  });

  const assignmentsByMovie = new Map<string, Set<string>>();
  const curatedByNode = new Map<string, Set<string>>();
  const dropped = {
    belowThreshold: 0,
    nodeTargetCap: 0,
    maxNodesPerMovie: 0,
    disallowedOverlap: 0,
  };
  const disallowedPairs = input.disableDisallowedPairs ? [] : input.governance.overlapConstraints.disallowedPairs;

  for (const node of input.spec.nodes) {
    const curated = new Set<string>();
    for (const anchor of node.titles) {
      const keys = [anchor.title, anchor.altTitle].filter((value): value is string => typeof value === 'string')
        .map((title) => makeLookupKey(title, anchor.year));
      const matched = keys
        .map((key) => movieByLookup.get(key))
        .find((movie): movie is CoverageMovie => Boolean(movie));
      if (!matched) {
        continue;
      }
      curated.add(matched.id);
      const set = assignmentsByMovie.get(matched.id) ?? new Set<string>();
      set.add(node.slug);
      assignmentsByMovie.set(matched.id, set);
    }
    curatedByNode.set(node.slug, curated);
  }
  const curatedAnchorsMatched = assignmentsByMovie.size;

  let scoringAboveAnyNode = 0;
  const aboveAny = new Set<string>();
  const flattened: Array<{ nodeSlug: string; movieId: string; probability: number; popularity: number }> = [];

  for (const node of input.spec.nodes) {
    const curated = curatedByNode.get(node.slug) ?? new Set<string>();
    const threshold = Math.max(0, Math.min(1, resolvePerNodeThreshold(input.governance, node.slug) + input.thresholdDelta));
    for (const movie of pool) {
      if (curated.has(movie.id)) {
        continue;
      }
      const probability = inferNodeProbabilities(movie, [node.slug], input.lfs)[0]!.probability;
      if (probability >= threshold) {
        flattened.push({
          nodeSlug: node.slug,
          movieId: movie.id,
          probability,
          popularity: movie.ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? 0,
        });
        aboveAny.add(movie.id);
      } else {
        dropped.belowThreshold += 1;
      }
    }
  }
  scoringAboveAnyNode = aboveAny.size;

  flattened.sort((a, b) => (b.probability - a.probability)
    || (b.popularity - a.popularity)
    || a.nodeSlug.localeCompare(b.nodeSlug)
    || a.movieId.localeCompare(b.movieId));

  const maxNodesPerMovie = input.maxNodesPerMovieOverride ?? input.governance.defaults.maxNodesPerMovie;
  const nodeSizes = Object.fromEntries(input.spec.nodes.map((node) => [node.slug, curatedByNode.get(node.slug)?.size ?? 0])) as Record<string, number>;

  for (const candidate of flattened) {
    const target = Math.max(1, resolvePerNodeTargetSize(input.governance, candidate.nodeSlug) + input.targetDelta);
    if ((nodeSizes[candidate.nodeSlug] ?? 0) >= target) {
      dropped.nodeTargetCap += 1;
      continue;
    }

    const movieAssignments = assignmentsByMovie.get(candidate.movieId) ?? new Set<string>();
    if (movieAssignments.has(candidate.nodeSlug)) {
      continue;
    }
    if (movieAssignments.size >= maxNodesPerMovie) {
      dropped.maxNodesPerMovie += 1;
      continue;
    }

    const disallowed = [...movieAssignments].some((slug) =>
      disallowedPairs.some(([a, b]) => toPairKey(a, b) === toPairKey(slug, candidate.nodeSlug)));
    if (disallowed) {
      dropped.disallowedOverlap += 1;
      continue;
    }

    movieAssignments.add(candidate.nodeSlug);
    assignmentsByMovie.set(candidate.movieId, movieAssignments);
    nodeSizes[candidate.nodeSlug] = (nodeSizes[candidate.nodeSlug] ?? 0) + 1;
  }

  const assignmentCount = [...assignmentsByMovie.values()].reduce((sum, set) => sum + set.size, 0);

  return {
    assignmentsByMovie,
    assignmentCount,
    nodeSizes,
    dropped,
    curatedAnchorsMatched,
    eligibleBeforeScoring: pool.length,
    scoringAboveAnyNode,
  };
}

function evaluateFixtureAgreement(assignmentsByMovie: Map<string, Set<string>>, movies: CoverageMovie[], fixture: GoldFixture): {
  hardMismatches: number;
  overlapRate: number;
} {
  const movieByTmdb = new Map(movies.map((movie) => [movie.tmdbId, movie] as const));
  const movieByLookup = new Map(movies.map((movie) => [makeLookupKey(movie.title, movie.year), movie] as const));
  let hardMismatches = 0;
  let overlapCount = 0;
  let foundCount = 0;

  for (const sample of fixture.samples) {
    const movie = (typeof sample.tmdbId === 'number' ? movieByTmdb.get(sample.tmdbId) : null)
      ?? movieByLookup.get(makeLookupKey(sample.title, sample.year))
      ?? null;
    if (!movie) {
      continue;
    }
    foundCount += 1;
    const assigned = [...(assignmentsByMovie.get(movie.id) ?? new Set<string>())];
    const evaluated = evaluateGoldSample(sample.expectedNodes, assigned);
    if (evaluated.overlap.length === 0) {
      hardMismatches += 1;
    } else {
      overlapCount += 1;
    }
  }
  const overlapRate = foundCount > 0 ? overlapCount / foundCount : 0;
  return { hardMismatches, overlapRate };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const specPath = resolve('docs/season/season-1-horror-subgenre-curriculum.json');
  const fixturePath = resolve('tests/fixtures/season1-node-gold.json');
  const outputPath = resolve('artifacts/season1-coverage-diagnosis.json');
  try {
    const spec = JSON.parse(await readFile(specPath, 'utf8')) as CurriculumSpec;
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as GoldFixture;
    const governance = SEASON1_NODE_GOVERNANCE_CONFIG;
    const lfs = buildSeason1LabelingFunctions(spec.nodes.map((node) => node.slug));

    const moviesRaw = await prisma.movie.findMany({
      select: {
        id: true,
        tmdbId: true,
        title: true,
        year: true,
        synopsis: true,
        genres: true,
        keywords: true,
        country: true,
        director: true,
        castTop: true,
        posterUrl: true,
        ratings: { select: { source: true, value: true, scale: true } },
      },
    });
    const movies: CoverageMovie[] = moviesRaw.map((movie) => ({
      id: movie.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      synopsis: movie.synopsis,
      genres: parseJsonStringArray(movie.genres),
      keywords: parseJsonStringArray(movie.keywords),
      country: movie.country,
      director: movie.director,
      castTop: movie.castTop,
      posterUrl: movie.posterUrl,
      ratings: movie.ratings,
    }));

    const published = await prisma.seasonNodeRelease.findFirst({
      where: {
        season: { slug: 'season-1' },
        pack: { slug: 'horror' },
        isPublished: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        taxonomyVersion: true,
        runId: true,
        items: { select: { movieId: true } },
      },
    });
    const tieredRowsRaw = await prisma.nodeMovie.findMany({
      where: {
        node: {
          pack: { slug: 'horror', season: { slug: 'season-1' } },
        },
      },
      select: {
        tier: true,
        finalScore: true,
        node: { select: { slug: true } },
      },
    });
    const tieredRows: TieredNodeRow[] = tieredRowsRaw.map((row) => ({
      nodeSlug: row.node.slug,
      tier: row.tier,
      finalScore: row.finalScore,
    }));

    const totalCatalog = movies.length;
    const withTmdbId = movies.filter((movie) => movie.tmdbId > 0);
    const withGenres = movies.filter((movie) => movie.genres.length > 0);
    const withHorrorGenre = movies.filter((movie) => movie.genres.includes('horror'));
    const withAnyHorrorSignal = movies.filter((movie) => hasHorrorAdjacentSignals(movie));

    const eligibilityRows = withHorrorGenre.map((movie) => ({
      movie,
      eval: evaluateCurriculumEligibility({
        posterUrl: movie.posterUrl,
        director: movie.director,
        castTop: movie.castTop,
        ratings: movie.ratings.map((rating) => ({ source: rating.source })),
        hasStreamingData: false,
      }),
    }));
    const eligibleBeforeScoring = eligibilityRows.filter((row) => row.eval.isEligible).map((row) => row.movie);
    const journeyWorthinessDiagnosticPass = eligibleBeforeScoring.filter((movie) =>
      isJourneyWorthinessDiagnosticPass(toJourneyWorthinessInput(movie), 'season-1')).length;
    const journeyWorthinessSelectionGatePass = eligibleBeforeScoring.filter((movie) =>
      isJourneyWorthinessSelectionGatePass(toJourneyWorthinessInput(movie), 'season-1')).length;

    const baselineSelection = runSelection({
      movies,
      spec,
      governance,
      lfs,
      includeAdjacentGate: false,
      thresholdDelta: 0,
      targetDelta: 0,
      maxNodesPerMovieOverride: governance.defaults.maxNodesPerMovie,
      disableDisallowedPairs: false,
    });

    const selectedSnapshotMovieIds = new Set(published?.items.map((item) => item.movieId) ?? []);
    const funnel: FunnelRow[] = [
      { stage: 'Total catalog movies', count: totalCatalog },
      { stage: 'Movies with TMDB id present', count: withTmdbId.length },
      { stage: 'Movies with genres present', count: withGenres.length },
      { stage: 'Movies with Horror genre tag', count: withHorrorGenre.length },
      { stage: 'Movies with any horror-adjacent signals', count: withAnyHorrorSignal.length },
      { stage: 'Eligible for Season 1 assignment before scoring', count: baselineSelection.eligibleBeforeScoring },
      { stage: 'Journey worthiness diagnostic pass', count: journeyWorthinessDiagnosticPass },
      { stage: 'Journey worthiness selection-gate pass', count: journeyWorthinessSelectionGatePass },
      { stage: 'Curated anchor movies resolved in catalog', count: baselineSelection.curatedAnchorsMatched },
      { stage: 'Weak-supervision scoring above threshold for >=1 node', count: baselineSelection.scoringAboveAnyNode },
      { stage: 'Selected into published snapshot', count: selectedSnapshotMovieIds.size },
    ];

    const missingMetadata = eligibilityRows.filter((row) => !row.eval.isEligible);
    const excludedBy = {
      missingPoster: missingMetadata.filter((row) => row.eval.missingPoster).length,
      missingRatings: missingMetadata.filter((row) => row.eval.missingRatings).length,
      missingReception: missingMetadata.filter((row) => row.eval.missingReception).length,
      missingCredits: missingMetadata.filter((row) => row.eval.missingCredits).length,
      adultFlagUnavailable: 0,
      regionLanguageFiltersUnavailable: 0,
      yearRuntimeConstraintsUnavailable: 0,
      duplicateResolution: 0,
      maxNodesPerMovie: baselineSelection.dropped.maxNodesPerMovie,
      perNodeTargetCap: baselineSelection.dropped.nodeTargetCap,
      disallowedOverlap: baselineSelection.dropped.disallowedOverlap,
    };

    const chokeStages = [
      { name: 'genres->horror-tag', drop: withGenres.length - withHorrorGenre.length },
      { name: 'horror-tag->eligible', drop: withHorrorGenre.length - baselineSelection.eligibleBeforeScoring },
      { name: 'eligible->above-threshold', drop: baselineSelection.eligibleBeforeScoring - baselineSelection.scoringAboveAnyNode },
      { name: 'above-threshold->selected', drop: baselineSelection.scoringAboveAnyNode - selectedSnapshotMovieIds.size },
    ].sort((a, b) => b.drop - a.drop);

    const scenarios: Array<{ name: string; args: Omit<SelectionInput, 'movies' | 'spec' | 'governance' | 'lfs'> }> = [
      {
        name: 'baseline',
        args: {
          includeAdjacentGate: false,
          thresholdDelta: 0,
          targetDelta: 0,
          maxNodesPerMovieOverride: governance.defaults.maxNodesPerMovie,
          disableDisallowedPairs: false,
        },
      },
      {
        name: 'lower-threshold-0.05',
        args: {
          includeAdjacentGate: false,
          thresholdDelta: -0.05,
          targetDelta: 0,
          maxNodesPerMovieOverride: governance.defaults.maxNodesPerMovie,
          disableDisallowedPairs: false,
        },
      },
      {
        name: 'target-plus-50',
        args: {
          includeAdjacentGate: false,
          thresholdDelta: 0,
          targetDelta: 50,
          maxNodesPerMovieOverride: governance.defaults.maxNodesPerMovie,
          disableDisallowedPairs: false,
        },
      },
      {
        name: 'max-nodes-2',
        args: {
          includeAdjacentGate: false,
          thresholdDelta: 0,
          targetDelta: 0,
          maxNodesPerMovieOverride: 2,
          disableDisallowedPairs: false,
        },
      },
      {
        name: 'max-nodes-3',
        args: {
          includeAdjacentGate: false,
          thresholdDelta: 0,
          targetDelta: 0,
          maxNodesPerMovieOverride: 3,
          disableDisallowedPairs: false,
        },
      },
      {
        name: 'disable-disallowed-overlaps',
        args: {
          includeAdjacentGate: false,
          thresholdDelta: 0,
          targetDelta: 0,
          maxNodesPerMovieOverride: governance.defaults.maxNodesPerMovie,
          disableDisallowedPairs: true,
        },
      },
      {
        name: 'adjacent-genre-gate-with-horror-signals',
        args: {
          includeAdjacentGate: true,
          thresholdDelta: 0,
          targetDelta: 0,
          maxNodesPerMovieOverride: governance.defaults.maxNodesPerMovie,
          disableDisallowedPairs: false,
        },
      },
    ];

    const ablations: ScenarioResult[] = scenarios.map((scenario) => {
      const result = runSelection({
        movies,
        spec,
        governance,
        lfs,
        ...scenario.args,
      });
      const disallowedPairs = governance.overlapConstraints.disallowedPairs;
      let overlapAnomalies = 0;
      for (const set of result.assignmentsByMovie.values()) {
        for (const [a, b] of disallowedPairs) {
          if (set.has(a) && set.has(b)) {
            overlapAnomalies += 1;
          }
        }
      }
      const fixtureStats = evaluateFixtureAgreement(result.assignmentsByMovie, movies, fixture);
      return {
        name: scenario.name,
        uniqueAssignedMovies: result.assignmentsByMovie.size,
        totalAssignments: result.assignmentCount,
        nodeSizes: result.nodeSizes,
        overlapAnomalies,
        hardFixtureMismatches: fixtureStats.hardMismatches,
        fixtureOverlapRate: Number(fixtureStats.overlapRate.toFixed(4)),
      };
    });

    const sampleSeed = 'season1-coverage-integrity-v1';
    const sample200 = withTmdbId
      .map((movie) => ({ movie, rank: stableRank(String(movie.tmdbId), sampleSeed) }))
      .sort((a, b) => a.rank.localeCompare(b.rank) || (a.movie.tmdbId - b.movie.tmdbId))
      .slice(0, 200)
      .map((item) => item.movie);
    const genreCounts = sample200.map((movie) => movie.genres.length);
    const emptyGenres = sample200.filter((movie) => movie.genres.length === 0).length;
    const oneGenreOnly = sample200.filter((movie) => movie.genres.length === 1).length;
    const knownGenreNames = new Set<string>([...Object.values(TMDB_GENRE_NAME_BY_ID), 'horror', 'sci-fi-horror']);
    const unknownGenreTokens = [...new Set(sample200.flatMap((movie) => movie.genres).filter((genre) => !knownGenreNames.has(genre)))];

    const diagnosis = {
      generatedAt: new Date().toISOString(),
      publishedSnapshot: published
        ? {
          id: published.id,
          taxonomyVersion: published.taxonomyVersion,
          runId: published.runId,
          assignmentItems: published.items.length,
          uniqueMovies: selectedSnapshotMovieIds.size,
        }
        : null,
      funnel,
      journeyWorthinessDiagnosticPass,
      journeyWorthinessSelectionGatePass,
      nodeTierSummary: Object.fromEntries(spec.nodes.map((node) => {
        const rows = tieredRows.filter((row) => row.nodeSlug === node.slug)
          .sort((a, b) => b.finalScore - a.finalScore);
        const coreRows = rows.filter((row) => row.tier === 'CORE');
        const extendedRows = rows.filter((row) => row.tier === 'EXTENDED');
        const targetSize = resolvePerNodeTargetSize(governance, node.slug);
        const coreThreshold = governance.nodes[node.slug]?.coreThreshold ?? governance.defaults.coreThreshold;
        return [node.slug, {
          coreCount: coreRows.length,
          extendedCount: extendedRows.length,
          boundaryScores: {
            atTargetSize: rows[targetSize - 1]?.finalScore ?? null,
            atTargetSizePlusOne: rows[targetSize]?.finalScore ?? null,
          },
          excludedOnlyDueToOverlapConstraints: 0,
          capPressure: extendedRows.filter((row) => row.finalScore >= coreThreshold).length - coreRows.length,
        }];
      })),
      excludedBy,
      biggestChokePoint: chokeStages[0] ?? null,
      ingestionIntegrity: {
        sampleSize: sample200.length,
        deterministicSeed: sampleSeed,
        emptyGenres,
        oneGenreOnly,
        minGenresPerMovie: Math.min(...genreCounts),
        maxGenresPerMovie: Math.max(...genreCounts),
        avgGenresPerMovie: Number((genreCounts.reduce((sum, n) => sum + n, 0) / Math.max(1, genreCounts.length)).toFixed(4)),
        unknownGenreTokens,
        horrorGenreId: TMDB_HORROR_GENRE_ID,
        horrorGenreMapped: TMDB_GENRE_NAME_BY_ID[TMDB_HORROR_GENRE_ID] === 'horror',
      },
      ablations,
    };

    await writeFile(outputPath, `${JSON.stringify(diagnosis, null, 2)}\n`, 'utf8');
    console.log(`Season 1 coverage diagnosis saved: ${outputPath}`);
    console.log(JSON.stringify({
      biggestChokePoint: diagnosis.biggestChokePoint,
      funnel: diagnosis.funnel,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 coverage diagnosis failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
