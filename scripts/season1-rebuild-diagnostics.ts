import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { evaluateCurriculumEligibility } from '../src/lib/curriculum/eligibility';
import {
  computeJourneyWorthiness,
  evaluateJourneyWorthinessSelectionGate,
  journeyWorthinessDiagnosticPass,
  type JourneyWorthinessMovieInput,
  type JourneyWorthinessReason,
} from '../src/lib/journey/journey-worthiness';
import { scoreMovieForNodes } from '../src/lib/nodes/scoring/scoreMovieForNodes';
import {
  resolvePerNodeTargetSize,
  resolvePerNodeThreshold,
  toPairKey,
} from '../src/lib/nodes/governance/season1-governance';
import { SEASON1_NODE_GOVERNANCE_CONFIG } from '../src/config/seasons/season1-node-governance';

type CliArgs = {
  outputDir: string;
  previousReleaseId?: string;
  seasonId: string;
  taxonomyVersion?: string;
  nowYear: number;
};

type ParsedMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  synopsis: string | null;
  genres: string[];
  keywords: string[];
  director: string | null;
  castTop: unknown;
  embedding: number[] | null;
  ratings: Array<{ source: string; value: number; scale: string | null }>;
};

type SnapshotItem = {
  movieId: string;
  nodeSlug: string;
  rank: number;
  source: string;
  score: number | null;
};

type QualityProblem = {
  movieId: string;
  tmdbId: number;
  title: string;
  nodes: string[];
  reasons: string[];
};

function parseCli(argv: string[]): CliArgs {
  const out = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const idx = arg.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = arg.slice(2, idx);
    const value = arg.slice(idx + 1);
    out.set(key, value);
  }
  const outputDir = out.get('outputDir');
  if (!outputDir) {
    throw new Error('Missing --outputDir');
  }
  return {
    outputDir: resolve(outputDir),
    previousReleaseId: out.get('previousReleaseId') || undefined,
    seasonId: out.get('seasonId') || 'season-1',
    taxonomyVersion: out.get('taxonomyVersion') || undefined,
    nowYear: Number.parseInt(out.get('nowYear') || '2026', 10),
  };
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

function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const parsed = value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
  return parsed.length > 0 ? parsed : null;
}

function getPopularity(ratings: ParsedMovie['ratings']): number {
  return ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? 0;
}

function getVoteCount(ratings: ParsedMovie['ratings']): number {
  return (
    ratings.find((rating) => rating.source === 'TMDB_VOTE_COUNT')?.value
    ?? ratings.find((rating) => rating.source === 'TMDB_VOTES')?.value
    ?? 0
  );
}

function hasDisallowedOverlap(existing: Set<string>, candidate: string): boolean {
  return [...existing].some((slug) =>
    SEASON1_NODE_GOVERNANCE_CONFIG.overlapConstraints.disallowedPairs
      .some(([a, b]) => toPairKey(a, b) === toPairKey(slug, candidate)));
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function buildJourneyInput(movie: ParsedMovie): JourneyWorthinessMovieInput {
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
  };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  await mkdir(cli.outputDir, { recursive: true });
  const prisma = new PrismaClient();

  try {
    const season = await prisma.season.findUnique({
      where: { slug: cli.seasonId },
      select: {
        id: true,
        packs: { where: { slug: 'horror' }, select: { id: true, slug: true } },
      },
    });
    if (!season || season.packs.length === 0) {
      throw new Error(`Season ${cli.seasonId} / horror pack not found`);
    }
    const pack = season.packs[0]!;

    const publishedReleases = await prisma.seasonNodeRelease.findMany({
      where: { seasonId: season.id, packId: pack.id, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, runId: true, taxonomyVersion: true, publishedAt: true, createdAt: true },
    });
    const latestRelease = publishedReleases[0];
    if (!latestRelease) {
      throw new Error('No published Season 1 release found');
    }
    const taxonomyVersion = cli.taxonomyVersion ?? latestRelease.taxonomyVersion;

    const previousReleaseId = cli.previousReleaseId;
    const previousRelease = previousReleaseId
      ? await prisma.seasonNodeRelease.findUnique({
        where: { id: previousReleaseId },
        select: { id: true, runId: true, taxonomyVersion: true, isPublished: true, publishedAt: true, createdAt: true },
      })
      : null;

    const [latestItemsRaw, previousItemsRaw, moviesRaw] = await Promise.all([
      prisma.seasonNodeReleaseItem.findMany({
        where: { releaseId: latestRelease.id },
        select: { movieId: true, nodeSlug: true, rank: true, source: true, score: true },
      }),
      previousRelease
        ? prisma.seasonNodeReleaseItem.findMany({
          where: { releaseId: previousRelease.id },
          select: { movieId: true, nodeSlug: true, rank: true, source: true, score: true },
        })
        : Promise.resolve([] as SnapshotItem[]),
      prisma.movie.findMany({
        select: {
          id: true,
          tmdbId: true,
          title: true,
          year: true,
          posterUrl: true,
          synopsis: true,
          genres: true,
          keywords: true,
          director: true,
          castTop: true,
          embedding: { select: { vectorJson: true } },
          ratings: { select: { source: true, value: true, scale: true } },
        },
      }),
    ]);

    const latestItems: SnapshotItem[] = latestItemsRaw;
    const previousItems: SnapshotItem[] = previousItemsRaw;
    const movieById = new Map<string, ParsedMovie>(
      moviesRaw.map((movie) => [movie.id, {
        id: movie.id,
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year,
        posterUrl: movie.posterUrl,
        synopsis: movie.synopsis,
        genres: parseJsonStringArray(movie.genres),
        keywords: parseJsonStringArray(movie.keywords),
        director: movie.director,
        castTop: movie.castTop,
        embedding: parseEmbedding(movie.embedding?.vectorJson),
        ratings: movie.ratings.map((rating) => ({
          source: rating.source,
          value: rating.value,
          scale: rating.scale,
        })),
      }] as const),
    );

    const nodeSlugs = Object.keys(SEASON1_NODE_GOVERNANCE_CONFIG.nodes);
    const latestAssignmentsByMovie = new Map<string, Set<string>>();
    for (const item of latestItems) {
      const set = latestAssignmentsByMovie.get(item.movieId) ?? new Set<string>();
      set.add(item.nodeSlug);
      latestAssignmentsByMovie.set(item.movieId, set);
    }
    const latestUniqueMovieIds = new Set(latestItems.map((item) => item.movieId));

    const allMovies = [...movieById.values()];
    const horrorTagged = allMovies.filter((movie) => movie.genres.includes('horror'));
    const eligibilityByMovie = new Map(horrorTagged.map((movie) => {
      const evalResult = evaluateCurriculumEligibility({
        posterUrl: movie.posterUrl,
        director: movie.director,
        castTop: movie.castTop,
        ratings: movie.ratings.map((rating) => ({ source: rating.source })),
        hasStreamingData: false,
      });
      return [movie.id, evalResult] as const;
    }));
    const eligibilityPass = horrorTagged.filter((movie) => eligibilityByMovie.get(movie.id)?.isEligible);

    const journeyGateByMovie = new Map(eligibilityPass.map((movie) => [
      movie.id,
      evaluateJourneyWorthinessSelectionGate(buildJourneyInput(movie), cli.seasonId, { nowYear: cli.nowYear }),
    ] as const));
    const journeyByMovie = new Map(
      [...journeyGateByMovie.entries()].map(([movieId, gate]) => [movieId, gate.result] as const),
    );
    const journeyPass = eligibilityPass.filter((movie) => Boolean(journeyGateByMovie.get(movie.id)?.pass));
    const journeyFail = eligibilityPass.filter((movie) => !journeyGateByMovie.get(movie.id)?.pass);
    const journeyWorthinessDiagnosticPassPool = eligibilityPass.filter((movie) =>
      journeyWorthinessDiagnosticPass(buildJourneyInput(movie), cli.seasonId, { nowYear: cli.nowYear })).length;
    const journeyWorthinessSelectionGatePassPool = journeyPass.length;
    const journeyWorthinessSelectionGateThreshold = journeyGateByMovie.size > 0
      ? journeyGateByMovie.values().next().value!.threshold
      : null;

    const scoreByMovieNode = new Map<string, ReturnType<typeof scoreMovieForNodes>[number]>();
    for (const movie of eligibilityPass) {
      const scored = scoreMovieForNodes({
        seasonId: cli.seasonId,
        taxonomyVersion,
        movie: {
          id: movie.id,
          tmdbId: movie.tmdbId,
          title: movie.title,
          year: movie.year,
          genres: movie.genres,
          keywords: movie.keywords,
          synopsis: movie.synopsis,
        },
        movieEmbedding: movie.embedding ?? undefined,
        nodeSlugs,
      });
      for (const row of scored) {
        scoreByMovieNode.set(`${movie.id}::${row.nodeSlug}`, row);
      }
    }

    const aboveThresholdCandidatesByNode: Record<string, number> = {};
    for (const nodeSlug of nodeSlugs) {
      const threshold = resolvePerNodeThreshold(SEASON1_NODE_GOVERNANCE_CONFIG, nodeSlug);
      let count = 0;
      for (const movie of journeyPass) {
        const score = scoreByMovieNode.get(`${movie.id}::${nodeSlug}`)?.finalScore ?? 0;
        if (score >= threshold) {
          count += 1;
        }
      }
      aboveThresholdCandidatesByNode[nodeSlug] = count;
    }

    const eligibilityReasonBreakdown = {
      missingPoster: 0,
      missingRatings: 0,
      missingReception: 0,
      missingCredits: 0,
    };
    for (const movie of horrorTagged) {
      const row = eligibilityByMovie.get(movie.id);
      if (!row || row.isEligible) {
        continue;
      }
      if (row.missingPoster) eligibilityReasonBreakdown.missingPoster += 1;
      if (row.missingRatings) eligibilityReasonBreakdown.missingRatings += 1;
      if (row.missingReception) eligibilityReasonBreakdown.missingReception += 1;
      if (row.missingCredits) eligibilityReasonBreakdown.missingCredits += 1;
    }

    const journeyReasonBreakdown: Record<JourneyWorthinessReason, number> = {
      low_vote_count: 0,
      missing_metadata: 0,
      runtime_outlier: 0,
      low_rating: 0,
    };
    for (const movie of journeyFail) {
      for (const reason of journeyByMovie.get(movie.id)?.reasons ?? []) {
        journeyReasonBreakdown[reason] += 1;
      }
    }

    let belowAllNodeThreshold = 0;
    for (const movie of journeyPass) {
      const hasAny = nodeSlugs.some((slug) => {
        const threshold = resolvePerNodeThreshold(SEASON1_NODE_GOVERNANCE_CONFIG, slug);
        return (scoreByMovieNode.get(`${movie.id}::${slug}`)?.finalScore ?? 0) >= threshold;
      });
      if (!hasAny) {
        belowAllNodeThreshold += 1;
      }
    }

    let droppedTargetCap = 0;
    let droppedMaxNodes = 0;
    let droppedDisallowedPairs = 0;
    let droppedOther = 0;
    const assignedCountByNode = Object.fromEntries(nodeSlugs.map((slug) => [slug, 0])) as Record<string, number>;
    for (const item of latestItems) {
      assignedCountByNode[item.nodeSlug] = (assignedCountByNode[item.nodeSlug] ?? 0) + 1;
    }
    for (const movie of journeyPass) {
      const assignedSet = latestAssignmentsByMovie.get(movie.id) ?? new Set<string>();
      for (const nodeSlug of nodeSlugs) {
        if (assignedSet.has(nodeSlug)) {
          continue;
        }
        const threshold = resolvePerNodeThreshold(SEASON1_NODE_GOVERNANCE_CONFIG, nodeSlug);
        const score = scoreByMovieNode.get(`${movie.id}::${nodeSlug}`)?.finalScore ?? 0;
        if (score < threshold) {
          continue;
        }
        if (assignedSet.size >= SEASON1_NODE_GOVERNANCE_CONFIG.defaults.maxNodesPerMovie) {
          droppedMaxNodes += 1;
        } else if ((assignedCountByNode[nodeSlug] ?? 0) >= resolvePerNodeTargetSize(SEASON1_NODE_GOVERNANCE_CONFIG, nodeSlug)) {
          droppedTargetCap += 1;
        } else if (hasDisallowedOverlap(assignedSet, nodeSlug)) {
          droppedDisallowedPairs += 1;
        } else {
          droppedOther += 1;
        }
      }
    }

    const coverageFunnel = {
      snapshot: {
        releaseId: latestRelease.id,
        runId: latestRelease.runId,
        taxonomyVersion,
      },
      counts: {
        totalCatalog: allMovies.length,
        horrorTaggedPool: horrorTagged.length,
        eligibilityPassPool: eligibilityPass.length,
        journeyWorthinessPassPool: journeyPass.length,
        journeyWorthinessDiagnosticPass: journeyWorthinessDiagnosticPassPool,
        journeyWorthinessSelectionGatePass: journeyWorthinessSelectionGatePassPool,
        journeyWorthinessSelectionGateThreshold,
        aboveThresholdNodeCandidatesPerNode: aboveThresholdCandidatesByNode,
        selectedIntoSnapshot: {
          uniqueMovies: latestUniqueMovieIds.size,
          totalAssignments: latestItems.length,
        },
      },
      exclusions: {
        failingEligibilityReasons: eligibilityReasonBreakdown,
        failingJourneyWorthinessReasons: journeyReasonBreakdown,
        failingNodeScoreThreshold: {
          belowAllNodeThreshold,
        },
        droppedDueToCapsOrConstraints: {
          targetSizeCap: droppedTargetCap,
          maxNodesPerMovie: droppedMaxNodes,
          disallowedPairs: droppedDisallowedPairs,
          selectionOrderOrOther: droppedOther,
        },
      },
      chokePoints: [
        { stage: 'catalog->horrorTagged', drop: allMovies.length - horrorTagged.length },
        { stage: 'horrorTagged->eligibilityPass', drop: horrorTagged.length - eligibilityPass.length },
        { stage: 'eligibilityPass->journeyWorthinessDiagnosticPass', drop: eligibilityPass.length - journeyWorthinessDiagnosticPassPool },
        { stage: 'eligibilityPass->journeyWorthinessSelectionGatePass', drop: eligibilityPass.length - journeyWorthinessSelectionGatePassPool },
        { stage: 'journeyWorthinessSelectionGatePass->selectedUnique', drop: journeyWorthinessSelectionGatePassPool - latestUniqueMovieIds.size },
      ].sort((a, b) => b.drop - a.drop),
    };

    const topAssignedByNode: Record<string, Array<Record<string, unknown>>> = {};
    const topNearMissByNode: Record<string, Array<Record<string, unknown>>> = {};
    const problemTitles: QualityProblem[] = [];
    const qualityGate = {
      minVoteCount: 1500,
      minRatingsQuality: 0.6,
      minMetadataCompleteness: 0.8,
      requireReceptionPresence: true,
    };

    const movieQualityCache = new Map<string, ReturnType<typeof computeJourneyWorthiness>>();
    for (const movieId of latestUniqueMovieIds) {
      const movie = movieById.get(movieId);
      if (!movie) continue;
      movieQualityCache.set(movieId, computeJourneyWorthiness(buildJourneyInput(movie), cli.seasonId, { nowYear: cli.nowYear }));
    }

    for (const nodeSlug of nodeSlugs) {
      const assignedItems = latestItems
        .filter((item) => item.nodeSlug === nodeSlug)
        .sort((a, b) => a.rank - b.rank);
      const assignedScores = assignedItems.map((item) => scoreByMovieNode.get(`${item.movieId}::${nodeSlug}`)?.finalScore ?? 0);
      const assignedJourney = assignedItems.map((item) => movieQualityCache.get(item.movieId)?.score ?? 0);

      topAssignedByNode[nodeSlug] = assignedItems.slice(0, 10).map((item) => {
        const movie = movieById.get(item.movieId);
        const scored = scoreByMovieNode.get(`${item.movieId}::${nodeSlug}`);
        return {
          movieId: item.movieId,
          tmdbId: movie?.tmdbId ?? null,
          title: movie?.title ?? item.movieId,
          rank: item.rank,
          source: item.source,
          weakScore: scored?.weakScore ?? 0,
          prototypeScore: scored?.prototypeScore ?? 0,
          finalScore: scored?.finalScore ?? 0,
          journeyWorthiness: movieQualityCache.get(item.movieId)?.score ?? 0,
        };
      });

      const threshold = resolvePerNodeThreshold(SEASON1_NODE_GOVERNANCE_CONFIG, nodeSlug);
      const nearMiss = journeyPass
        .filter((movie) => !(latestAssignmentsByMovie.get(movie.id)?.has(nodeSlug)))
        .map((movie) => {
          const scored = scoreByMovieNode.get(`${movie.id}::${nodeSlug}`);
          return {
            movie,
            finalScore: scored?.finalScore ?? 0,
            weakScore: scored?.weakScore ?? 0,
            prototypeScore: scored?.prototypeScore ?? 0,
            journeyWorthiness: journeyByMovie.get(movie.id)?.score ?? 0,
          };
        })
        .filter((entry) => entry.finalScore < threshold)
        .sort((a, b) => (b.finalScore - a.finalScore) || (b.journeyWorthiness - a.journeyWorthiness))
        .slice(0, 10)
        .map((entry) => ({
          movieId: entry.movie.id,
          tmdbId: entry.movie.tmdbId,
          title: entry.movie.title,
          finalScore: entry.finalScore,
          weakScore: entry.weakScore,
          prototypeScore: entry.prototypeScore,
          journeyWorthiness: entry.journeyWorthiness,
          threshold,
          gapToThreshold: round6(threshold - entry.finalScore),
        }));
      topNearMissByNode[nodeSlug] = nearMiss;

      for (const item of assignedItems) {
        const movie = movieById.get(item.movieId);
        const journey = movieQualityCache.get(item.movieId);
        if (!movie || !journey) continue;
        const reasons: string[] = [];
        const voteCount = getVoteCount(movie.ratings);
        if (voteCount < qualityGate.minVoteCount) reasons.push('low_vote_count');
        const ratingsQuality = journey.breakdown.ratingsQuality;
        const hasHighConfidenceCurated = item.source === 'curated'
          && (scoreByMovieNode.get(`${item.movieId}::${nodeSlug}`)?.finalScore ?? 0) >= 0.8;
        if (ratingsQuality < qualityGate.minRatingsQuality && !hasHighConfidenceCurated) reasons.push('low_rating_or_confidence');
        if (journey.breakdown.metadataCompleteness < qualityGate.minMetadataCompleteness) reasons.push('low_metadata_completeness');
        if (qualityGate.requireReceptionPresence && journey.breakdown.receptionPresence <= 0) reasons.push('no_reception_sources');
        if (reasons.length > 0) {
          const existing = problemTitles.find((row) => row.movieId === movie.id);
          if (existing) {
            if (!existing.nodes.includes(nodeSlug)) existing.nodes.push(nodeSlug);
            for (const reason of reasons) if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
          } else {
            problemTitles.push({
              movieId: movie.id,
              tmdbId: movie.tmdbId,
              title: movie.title,
              nodes: [nodeSlug],
              reasons,
            });
          }
        }
      }

      void assignedScores;
      void assignedJourney;
    }

    const nodeDistribution = {
      snapshot: {
        releaseId: latestRelease.id,
        runId: latestRelease.runId,
        taxonomyVersion,
      },
      journeyWorthiness: {
        diagnosticPass: journeyWorthinessDiagnosticPassPool,
        selectionGatePass: journeyWorthinessSelectionGatePassPool,
      },
      nodes: Object.fromEntries(nodeSlugs.map((nodeSlug) => {
        const assignedItems = latestItems.filter((item) => item.nodeSlug === nodeSlug);
        const finalScores = assignedItems.map((item) => scoreByMovieNode.get(`${item.movieId}::${nodeSlug}`)?.finalScore ?? 0);
        const journeyScores = assignedItems.map((item) => movieQualityCache.get(item.movieId)?.score ?? 0);
        return [nodeSlug, {
          assignedCount: assignedItems.length,
          avgFinalScore: round6(avg(finalScores)),
          avgJourneyWorthiness: round6(avg(journeyScores)),
          topAssignedTitles: topAssignedByNode[nodeSlug],
          topNearMissCandidates: topNearMissByNode[nodeSlug],
        }];
      })),
      overlap: (() => {
        const overThree = [...latestAssignmentsByMovie.entries()]
          .filter(([, nodes]) => nodes.size > 3)
          .map(([movieId, nodes]) => {
            const movie = movieById.get(movieId);
            return {
              movieId,
              tmdbId: movie?.tmdbId ?? null,
              title: movie?.title ?? movieId,
              nodeCount: nodes.size,
              nodes: [...nodes].sort(),
            };
          });
        const pairCounts = new Map<string, number>();
        for (const nodes of latestAssignmentsByMovie.values()) {
          const sorted = [...nodes].sort();
          for (let i = 0; i < sorted.length; i += 1) {
            for (let j = i + 1; j < sorted.length; j += 1) {
              const key = toPairKey(sorted[i]!, sorted[j]!);
              pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
            }
          }
        }
        const topPairs = [...pairCounts.entries()]
          .map(([key, count]) => ({ pair: key.split('||'), count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20);
        const disallowedViolations = [...latestAssignmentsByMovie.entries()].flatMap(([movieId, nodes]) => {
          return SEASON1_NODE_GOVERNANCE_CONFIG.overlapConstraints.disallowedPairs
            .filter(([a, b]) => nodes.has(a) && nodes.has(b))
            .map(([a, b]) => ({ movieId, pair: [a, b] as [string, string] }));
        });
        return {
          moviesAssignedToMoreThan3Nodes: overThree,
          topCooccurrencePairs: topPairs,
          disallowedPairViolations: disallowedViolations,
        };
      })(),
    };

    const assignedUniqueMovies = [...latestUniqueMovieIds]
      .map((movieId) => movieById.get(movieId))
      .filter((movie): movie is ParsedMovie => Boolean(movie));
    const passAllCount = assignedUniqueMovies.filter((movie) => !problemTitles.some((row) => row.movieId === movie.id)).length;
    const qualityMetrics = {
      snapshot: {
        releaseId: latestRelease.id,
        runId: latestRelease.runId,
        taxonomyVersion,
      },
      qualityGate,
      assignedUniqueMovies: assignedUniqueMovies.length,
      passAllQualityGatesCount: passAllCount,
      passAllQualityGatesPct: round6(assignedUniqueMovies.length > 0 ? passAllCount / assignedUniqueMovies.length : 0),
      belowQualityGateCount: problemTitles.length,
      problemTitles: problemTitles
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 500),
    };

    const previousAssignmentsByNode = new Map<string, Set<string>>();
    const latestAssignmentsByNode = new Map<string, Set<string>>();
    for (const nodeSlug of nodeSlugs) {
      previousAssignmentsByNode.set(nodeSlug, new Set(previousItems.filter((item) => item.nodeSlug === nodeSlug).map((item) => item.movieId)));
      latestAssignmentsByNode.set(nodeSlug, new Set(latestItems.filter((item) => item.nodeSlug === nodeSlug).map((item) => item.movieId)));
    }
    const addedByNode: Record<string, Array<Record<string, unknown>>> = {};
    const removedByNode: Record<string, Array<Record<string, unknown>>> = {};
    const nodeSizeChanges: Record<string, { previous: number; current: number; delta: number }> = {};
    for (const nodeSlug of nodeSlugs) {
      const prev = previousAssignmentsByNode.get(nodeSlug) ?? new Set<string>();
      const curr = latestAssignmentsByNode.get(nodeSlug) ?? new Set<string>();
      const added = [...curr].filter((movieId) => !prev.has(movieId));
      const removed = [...prev].filter((movieId) => !curr.has(movieId));
      addedByNode[nodeSlug] = added.slice(0, 200).map((movieId) => {
        const movie = movieById.get(movieId);
        return { movieId, tmdbId: movie?.tmdbId ?? null, title: movie?.title ?? movieId };
      });
      removedByNode[nodeSlug] = removed.slice(0, 200).map((movieId) => {
        const movie = movieById.get(movieId);
        return { movieId, tmdbId: movie?.tmdbId ?? null, title: movie?.title ?? movieId };
      });
      nodeSizeChanges[nodeSlug] = {
        previous: prev.size,
        current: curr.size,
        delta: curr.size - prev.size,
      };
    }

    const previousUniqueIds = new Set(previousItems.map((item) => item.movieId));
    const addedUnique = [...latestUniqueMovieIds].filter((id) => !previousUniqueIds.has(id));
    const removedUnique = [...previousUniqueIds].filter((id) => !latestUniqueMovieIds.has(id));

    const previousProblemCount = (() => {
      if (previousItems.length === 0) return 0;
      const previousUniqueMovies = [...previousUniqueIds]
        .map((movieId) => movieById.get(movieId))
        .filter((movie): movie is ParsedMovie => Boolean(movie));
      let count = 0;
      for (const movie of previousUniqueMovies) {
        const journey = computeJourneyWorthiness(buildJourneyInput(movie), cli.seasonId, { nowYear: cli.nowYear });
        const reasons: string[] = [];
        if (getVoteCount(movie.ratings) < qualityGate.minVoteCount) reasons.push('low_vote_count');
        if (journey.breakdown.ratingsQuality < qualityGate.minRatingsQuality) reasons.push('low_rating_or_confidence');
        if (journey.breakdown.metadataCompleteness < qualityGate.minMetadataCompleteness) reasons.push('low_metadata_completeness');
        if (qualityGate.requireReceptionPresence && journey.breakdown.receptionPresence <= 0) reasons.push('no_reception_sources');
        if (reasons.length > 0) count += 1;
      }
      return count;
    })();

    const diffVsPrevious = {
      previousSnapshot: previousRelease
        ? {
          releaseId: previousRelease.id,
          runId: previousRelease.runId,
          taxonomyVersion: previousRelease.taxonomyVersion,
          isPublished: previousRelease.isPublished,
        }
        : null,
      currentSnapshot: {
        releaseId: latestRelease.id,
        runId: latestRelease.runId,
        taxonomyVersion,
        isPublished: true,
      },
      counts: {
        previousUniqueMovies: previousUniqueIds.size,
        currentUniqueMovies: latestUniqueMovieIds.size,
        deltaUniqueMovies: latestUniqueMovieIds.size - previousUniqueIds.size,
        previousAssignments: previousItems.length,
        currentAssignments: latestItems.length,
        deltaAssignments: latestItems.length - previousItems.length,
        addedUniqueMovies: addedUnique.length,
        removedUniqueMovies: removedUnique.length,
      },
      addedMovies: addedUnique.slice(0, 400).map((movieId) => {
        const movie = movieById.get(movieId);
        return {
          movieId,
          tmdbId: movie?.tmdbId ?? null,
          title: movie?.title ?? movieId,
          nodes: [...(latestAssignmentsByMovie.get(movieId) ?? new Set<string>())].sort(),
        };
      }),
      removedMovies: removedUnique.slice(0, 400).map((movieId) => {
        const movie = movieById.get(movieId);
        return {
          movieId,
          tmdbId: movie?.tmdbId ?? null,
          title: movie?.title ?? movieId,
          nodes: [...(new Set(previousItems.filter((item) => item.movieId === movieId).map((item) => item.nodeSlug)))].sort(),
        };
      }),
      nodeSizeChanges,
      overlapChanges: {
        previousMoreThan3Nodes: (() => {
          const map = new Map<string, Set<string>>();
          for (const item of previousItems) {
            const set = map.get(item.movieId) ?? new Set<string>();
            set.add(item.nodeSlug);
            map.set(item.movieId, set);
          }
          return [...map.values()].filter((set) => set.size > 3).length;
        })(),
        currentMoreThan3Nodes: nodeDistribution.overlap.moviesAssignedToMoreThan3Nodes.length,
      },
      qualityChanges: {
        previousBelowGateCount: previousProblemCount,
        currentBelowGateCount: qualityMetrics.belowQualityGateCount,
        deltaBelowGateCount: qualityMetrics.belowQualityGateCount - previousProblemCount,
      },
      addedByNode,
      removedByNode,
    };

    await Promise.all([
      writeFile(resolve(cli.outputDir, 'coverage-funnel.json'), `${JSON.stringify(coverageFunnel, null, 2)}\n`, 'utf8'),
      writeFile(resolve(cli.outputDir, 'node-distribution.json'), `${JSON.stringify(nodeDistribution, null, 2)}\n`, 'utf8'),
      writeFile(resolve(cli.outputDir, 'quality-metrics.json'), `${JSON.stringify(qualityMetrics, null, 2)}\n`, 'utf8'),
      writeFile(resolve(cli.outputDir, 'diff-vs-previous.json'), `${JSON.stringify(diffVsPrevious, null, 2)}\n`, 'utf8'),
    ]);

    console.log(JSON.stringify({
      outputDir: cli.outputDir,
      snapshot: coverageFunnel.snapshot,
      selected: coverageFunnel.counts.selectedIntoSnapshot,
      topChokePoints: coverageFunnel.chokePoints.slice(0, 3),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[season1-rebuild-diagnostics] failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
