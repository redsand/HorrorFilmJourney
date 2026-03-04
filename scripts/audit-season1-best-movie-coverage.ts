import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { evaluateCurriculumEligibility } from '../src/lib/curriculum/eligibility';
import {
  evaluateJourneyWorthinessSelectionGate,
  type JourneyWorthinessMovieInput,
} from '../src/lib/journey/journey-worthiness';
import { scoreMovieForNodes, type NodeScore } from '../src/lib/nodes/scoring/scoreMovieForNodes';
import { computeReceptionCount } from '../src/lib/movie/reception';
import {
  resolvePerNodeCoreThreshold,
  resolvePerNodeQualityFloor,
  resolvePerNodeTargetSize,
} from '../src/lib/nodes/governance/season1-governance';
import { SEASON1_NODE_GOVERNANCE_CONFIG } from '../src/config/seasons/season1-node-governance';

type Cli = {
  outputDir: string;
  seasonSlug: string;
  packSlug: string;
  nowYear: number;
  seed: string;
};

type ParsedMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  synopsis: string | null;
  director: string | null;
  castTop: unknown;
  genres: string[];
  keywords: string[];
  embedding: number[] | null;
  ratings: Array<{ source: string; value: number; scale: string | null }>;
  externalReadingCount: number;
  runtimeMinutes: number | null;
};

type ScoredMovie = {
  movie: ParsedMovie;
  horrorTagged: boolean;
  eligibility: ReturnType<typeof evaluateCurriculumEligibility>;
  journey: ReturnType<typeof evaluateJourneyWorthinessSelectionGate>;
  metrics: {
    rating: number;
    voteCount: number;
    tmdbVoteAverage: number;
    popularity: number;
    receptionCount: number;
    journeyScore: number;
    hybridScore: number;
  };
};

type TopListEntry = {
  movieId: string;
  rank: number;
  score: number;
};

function parseCli(argv: string[]): Cli {
  const out = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const idx = arg.indexOf('=');
    if (idx <= 2) continue;
    out.set(arg.slice(2, idx), arg.slice(idx + 1));
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    outputDir: resolve(out.get('outputDir') ?? `artifacts/season1/coverage-audit/${timestamp}`),
    seasonSlug: out.get('seasonSlug') ?? 'season-1',
    packSlug: out.get('packSlug') ?? 'horror',
    nowYear: Number.parseInt(out.get('nowYear') ?? '2026', 10),
    seed: out.get('seed') ?? 'season1-best-coverage-audit-v1',
  };
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stableTieBreak(seed: string, value: string): string {
  return createHash('sha256').update(`${seed}:${value}`).digest('hex');
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
  return parsed.length > 0 ? parsed : null;
}

function getRating(ratings: ParsedMovie['ratings']): number {
  const imdb = ratings.find((rating) => rating.source === 'IMDB')?.value;
  if (typeof imdb === 'number' && Number.isFinite(imdb) && imdb > 0) return imdb;
  const tmdb = ratings.find((rating) => rating.source === 'TMDB')?.value;
  if (typeof tmdb === 'number' && Number.isFinite(tmdb) && tmdb > 0) return tmdb;
  return 0;
}

function getRuntimeMinutes(ratings: ParsedMovie['ratings']): number | null {
  const runtime = ratings.find((rating) => rating.source === 'TMDB_RUNTIME')?.value ?? null;
  if (typeof runtime !== 'number' || !Number.isFinite(runtime) || runtime <= 0) {
    return null;
  }
  return Math.round(runtime);
}

function getVoteCount(ratings: ParsedMovie['ratings']): number {
  const value = ratings.find((rating) => rating.source === 'TMDB_VOTE_COUNT')?.value
    ?? ratings.find((rating) => rating.source === 'TMDB_VOTES')?.value
    ?? 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getTmdbVoteAverage(ratings: ParsedMovie['ratings']): number {
  const value = ratings.find((rating) => rating.source === 'TMDB')?.value ?? 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getPopularity(ratings: ParsedMovie['ratings']): number {
  const value = ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function hasHorrorAdjacentSignals(movie: ParsedMovie): boolean {
  const genreSet = new Set(movie.genres);
  if (genreSet.has('horror')) return true;
  const adjacentGenre = genreSet.has('thriller') || genreSet.has('mystery') || genreSet.has('sci-fi') || genreSet.has('fantasy');
  if (!adjacentGenre) return false;
  const keywordText = movie.keywords.join(' ');
  return /\bhorror\b|\boccult\b|\bhaunt|\bghost\b|\bdemon\b|\bzombie\b|\bslasher\b|\bmonster\b|\bsupernatural\b|\bcreepy\b/i.test(keywordText);
}

function hasStrictHorrorSignals(movie: ParsedMovie): boolean {
  if (movie.genres.some((genre) => genre === 'horror' || genre.includes('horror'))) {
    return true;
  }
  const keywordText = movie.keywords.join(' ');
  return /\bhorror\b|\bslasher\b|\bzombie\b|\bghost\b|\bhaunt|\bdemon\b|\boccult\b|\bmonster\b|\bsupernatural\b/i.test(keywordText);
}

function toJourneyInput(movie: ParsedMovie): JourneyWorthinessMovieInput {
  return {
    year: movie.year,
    runtimeMinutes: movie.runtimeMinutes,
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
    receptionSources: movie.externalReadingCount > 0 ? ['external-curation'] : [],
  };
}

function computeHybridScore(input: { rating: number; voteCount: number; popularity: number; journeyScore: number }): number {
  const ratingNorm = clamp01(input.rating / 10);
  const votesNorm = clamp01(Math.log10(input.voteCount + 1) / 6);
  const popularityNorm = clamp01(input.popularity / 100);
  const journeyNorm = clamp01(input.journeyScore);
  return round6((ratingNorm * 0.4) + (votesNorm * 0.25) + (popularityNorm * 0.15) + (journeyNorm * 0.2));
}

function quantiles(values: number[]): { p10: number; p25: number; p50: number; p75: number; p90: number } {
  if (values.length === 0) return { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number => {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
    return round6(sorted[idx]!);
  };
  return { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round6((numerator / denominator) * 100);
}

function firstEligibilityFailReason(eligibility: ReturnType<typeof evaluateCurriculumEligibility>): string | null {
  if (eligibility.isEligible) return null;
  if (eligibility.missingPoster) return 'missing_poster';
  if (eligibility.missingRatings) return 'missing_ratings';
  if (eligibility.missingReception) return 'missing_reception';
  if (eligibility.missingCredits) return 'missing_credits';
  return 'fails_curriculum_eligibility';
}

function hasMissingCreditsOrMetadata(row: ScoredMovie): boolean {
  const cast = Array.isArray(row.movie.castTop) ? row.movie.castTop : [];
  const hasCast = cast.some((entry) => {
    if (typeof entry === 'string') return entry.trim().length > 0;
    return Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string' && (entry as { name: string }).name.trim().length > 0);
  });
  const hasDirector = typeof row.movie.director === 'string' && row.movie.director.trim().length > 0;
  const hasSynopsis = typeof row.movie.synopsis === 'string' && row.movie.synopsis.trim().length > 0;
  const hasPoster = typeof row.movie.posterUrl === 'string' && row.movie.posterUrl.trim().length > 0;
  return !hasDirector || !hasCast || !hasSynopsis || !hasPoster;
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  await mkdir(cli.outputDir, { recursive: true });
  await mkdir(resolve('docs'), { recursive: true });

  const prisma = new PrismaClient();
  try {
    const season = await prisma.season.findUnique({
      where: { slug: cli.seasonSlug },
      select: {
        id: true,
        slug: true,
        packs: { where: { slug: cli.packSlug }, select: { id: true, slug: true, name: true } },
      },
    });
    if (!season || season.packs.length === 0) {
      throw new Error(`Missing ${cli.seasonSlug}/${cli.packSlug}`);
    }
    const pack = season.packs[0]!;

    const latestRelease = await prisma.seasonNodeRelease.findFirst({
      where: { seasonId: season.id, packId: pack.id, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, runId: true, taxonomyVersion: true, publishedAt: true },
    });
    if (!latestRelease) {
      throw new Error('No published Season 1 release found');
    }

    const [releaseItems, allMoviesRaw, externalReadingCounts] = await Promise.all([
      prisma.seasonNodeReleaseItem.findMany({
        where: { releaseId: latestRelease.id },
        select: { movieId: true, nodeSlug: true, rank: true },
      }),
      prisma.movie.findMany({
        select: {
          id: true,
          tmdbId: true,
          title: true,
          year: true,
          posterUrl: true,
          synopsis: true,
          director: true,
          castTop: true,
          genres: true,
          keywords: true,
          embedding: { select: { vectorJson: true } },
          ratings: { select: { source: true, value: true, scale: true } },
        },
      }),
      prisma.externalReadingCuration.groupBy({
        by: ['movieId'],
        where: { seasonId: season.id },
        _count: { _all: true },
      }),
    ]);

    const externalReadingCountByMovie = new Map(externalReadingCounts.map((row) => [row.movieId, row._count._all] as const));

    const allMovies: ParsedMovie[] = allMoviesRaw.map((movie) => ({
      id: movie.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      posterUrl: movie.posterUrl,
      synopsis: movie.synopsis,
      director: movie.director,
      castTop: movie.castTop,
      genres: parseJsonStringArray(movie.genres),
      keywords: parseJsonStringArray(movie.keywords),
      embedding: parseEmbedding(movie.embedding?.vectorJson),
      ratings: movie.ratings.map((rating) => ({ source: rating.source, value: rating.value, scale: rating.scale })),
      externalReadingCount: externalReadingCountByMovie.get(movie.id) ?? 0,
      runtimeMinutes: getRuntimeMinutes(movie.ratings.map((rating) => ({ source: rating.source, value: rating.value, scale: rating.scale }))),
    }));

    const nodeSlugs = Object.keys(SEASON1_NODE_GOVERNANCE_CONFIG.nodes);
    const rowsWithRun = await prisma.nodeMovie.findMany({
      where: {
        node: { packId: pack.id },
        taxonomyVersion: latestRelease.taxonomyVersion,
        runId: latestRelease.runId,
      },
      select: {
        movieId: true,
        rank: true,
        coreRank: true,
        tier: true,
        finalScore: true,
        journeyScore: true,
        node: { select: { slug: true } },
      },
    });
    const tieredRows = rowsWithRun.length > 0
      ? rowsWithRun
      : await prisma.nodeMovie.findMany({
        where: { node: { packId: pack.id }, taxonomyVersion: latestRelease.taxonomyVersion },
        select: {
          movieId: true,
          rank: true,
          coreRank: true,
          tier: true,
          finalScore: true,
          journeyScore: true,
          node: { select: { slug: true } },
        },
      });

    const rowsByNode = new Map<string, typeof tieredRows>();
    for (const slug of nodeSlugs) rowsByNode.set(slug, []);
    for (const row of tieredRows) {
      const list = rowsByNode.get(row.node.slug) ?? [];
      list.push(row);
      rowsByNode.set(row.node.slug, list);
    }

    const coreMovieIds = new Set(tieredRows.filter((row) => row.tier === 'CORE').map((row) => row.movieId));
    const extendedMovieIds = new Set(tieredRows.filter((row) => row.tier === 'EXTENDED').map((row) => row.movieId));
    const extendedOnlyMovieIds = new Set([...extendedMovieIds].filter((movieId) => !coreMovieIds.has(movieId)));
    const totalSnapshotMovieIds = new Set([...coreMovieIds, ...extendedMovieIds]);
    const releaseMovieIds = new Set(releaseItems.map((item) => item.movieId));

    const scoredMovies: ScoredMovie[] = allMovies.map((movie) => {
      const eligibility = evaluateCurriculumEligibility({
        posterUrl: movie.posterUrl,
        director: movie.director,
        castTop: movie.castTop,
        ratings: movie.ratings.map((rating) => ({ source: rating.source })),
        hasStreamingData: false,
      });
      const journey = evaluateJourneyWorthinessSelectionGate(toJourneyInput(movie), cli.seasonSlug, { nowYear: cli.nowYear });
      const rating = getRating(movie.ratings);
      const voteCount = getVoteCount(movie.ratings);
      const tmdbVoteAverage = getTmdbVoteAverage(movie.ratings);
      const popularity = getPopularity(movie.ratings);
      const hybridScore = computeHybridScore({ rating, voteCount, popularity, journeyScore: journey.result.score });
      return {
        movie,
        horrorTagged: hasHorrorAdjacentSignals(movie),
        eligibility,
        journey,
        metrics: {
          rating: round6(rating),
          voteCount: Math.floor(voteCount),
          tmdbVoteAverage: round6(tmdbVoteAverage),
          popularity: round6(popularity),
          receptionCount: computeReceptionCount(movie.ratings.map((rating) => ({
            source: rating.source,
            value: rating.value,
          }))),
          journeyScore: journey.result.score,
          hybridScore,
        },
      };
    });
    const scoredByMovieId = new Map(scoredMovies.map((row) => [row.movie.id, row] as const));

    const snapshotSummary = {
      seasonSlug: season.slug,
      packSlug: pack.slug,
      packName: pack.name,
      release: {
        releaseId: latestRelease.id,
        runId: latestRelease.runId,
        taxonomyVersion: latestRelease.taxonomyVersion,
        publishedAt: latestRelease.publishedAt?.toISOString() ?? null,
      },
      counts: {
        coreUniqueMovies: coreMovieIds.size,
        extendedUniqueMovies: extendedMovieIds.size,
        extendedUniqueOnlyMovies: extendedOnlyMovieIds.size,
        totalUniqueMovies: totalSnapshotMovieIds.size,
        releaseUniqueMovies: releaseMovieIds.size,
        totalAssignments: tieredRows.length,
      },
    };

    const nodeCoreBoundaries = {
      snapshot: snapshotSummary,
      nodes: Object.fromEntries(nodeSlugs.map((nodeSlug) => {
        const rows = (rowsByNode.get(nodeSlug) ?? []).sort((a, b) =>
          (b.finalScore - a.finalScore) || (b.journeyScore - a.journeyScore) || (a.movieId.localeCompare(b.movieId)));
        const coreCount = rows.filter((row) => row.tier === 'CORE').length;
        const extendedCount = rows.filter((row) => row.tier === 'EXTENDED').length;
        const targetSize = resolvePerNodeTargetSize(SEASON1_NODE_GOVERNANCE_CONFIG, nodeSlug);
        const coreThreshold = resolvePerNodeCoreThreshold(SEASON1_NODE_GOVERNANCE_CONFIG, nodeSlug);
        const atTarget = rows[targetSize - 1]?.finalScore ?? null;
        const belowTarget = rows[targetSize]?.finalScore ?? null;
        const scoreDelta = atTarget === null || belowTarget === null ? null : round6(atTarget - belowTarget);
        const capPressure = rows.filter((row) => row.finalScore >= coreThreshold).length - coreCount;
        return [nodeSlug, {
          coreCount,
          extendedCount,
          targetSize,
          coreThreshold,
          scoreAtCoreBoundary: atTarget,
          scoreBelowCoreBoundary: belowTarget,
          scoreDelta,
          capPressure,
          notes: scoreDelta !== null && scoreDelta < 0.01 && capPressure > 15
            ? 'tiny_cliff_high_pressure'
            : scoreDelta !== null && scoreDelta >= 0.01
              ? 'clean_boundary'
              : 'insufficient_rows',
        }];
      })),
    };

    const horrorPool = scoredMovies.filter((row) => row.horrorTagged);
    const topByVotes: TopListEntry[] = horrorPool
      .filter((row) => row.metrics.rating >= 6.5)
      .sort((a, b) => (b.metrics.voteCount - a.metrics.voteCount)
        || (b.metrics.rating - a.metrics.rating)
        || stableTieBreak(cli.seed, a.movie.id).localeCompare(stableTieBreak(cli.seed, b.movie.id)))
      .slice(0, 500)
      .map((row, idx) => ({ movieId: row.movie.id, rank: idx + 1, score: row.metrics.voteCount }));
    const topByRating: TopListEntry[] = horrorPool
      .filter((row) => row.metrics.voteCount >= 10_000)
      .sort((a, b) => (b.metrics.rating - a.metrics.rating)
        || (b.metrics.voteCount - a.metrics.voteCount)
        || stableTieBreak(cli.seed, a.movie.id).localeCompare(stableTieBreak(cli.seed, b.movie.id)))
      .slice(0, 500)
      .map((row, idx) => ({ movieId: row.movie.id, rank: idx + 1, score: row.metrics.rating }));
    const topByHybrid: TopListEntry[] = horrorPool
      .sort((a, b) => (b.metrics.hybridScore - a.metrics.hybridScore)
        || (b.metrics.voteCount - a.metrics.voteCount)
        || stableTieBreak(cli.seed, a.movie.id).localeCompare(stableTieBreak(cli.seed, b.movie.id)))
      .slice(0, 500)
      .map((row, idx) => ({ movieId: row.movie.id, rank: idx + 1, score: row.metrics.hybridScore }));

    const coverageForList = (name: string, list: TopListEntry[]) => {
      const inCore = list.filter((entry) => coreMovieIds.has(entry.movieId)).length;
      const inExtended = list.filter((entry) => !coreMovieIds.has(entry.movieId) && extendedMovieIds.has(entry.movieId)).length;
      const inSnapshot = inCore + inExtended;
      const notInSnapshot = list.length - inSnapshot;
      return {
        name,
        listSize: list.length,
        countInCore: inCore,
        countInExtended: inExtended,
        countNotInSnapshot: notInSnapshot,
        coveragePercentCore: toPct(inCore, list.length),
        coveragePercentTotalSnapshot: toPct(inSnapshot, list.length),
      };
    };
    const toplistCoverage = [
      coverageForList('TopByVotes', topByVotes),
      coverageForList('TopByRating', topByRating),
      coverageForList('TopByHybrid', topByHybrid),
    ];

    const candidatePoolForScoring = horrorPool.filter((row) => row.eligibility.isEligible && row.journey.pass);
    const scoreCache = new Map<string, NodeScore[]>();
    for (const row of candidatePoolForScoring) {
      scoreCache.set(row.movie.id, scoreMovieForNodes({
        seasonId: cli.seasonSlug,
        taxonomyVersion: latestRelease.taxonomyVersion,
        movie: {
          id: row.movie.id,
          tmdbId: row.movie.tmdbId,
          title: row.movie.title,
          year: row.movie.year,
          genres: row.movie.genres,
          keywords: row.movie.keywords,
          synopsis: row.movie.synopsis,
        },
        movieEmbedding: row.movie.embedding ?? undefined,
        nodeSlugs,
      }));
    }

    const rankMaps = new Map<string, { votes?: number; rating?: number; hybrid?: number }>();
    for (const entry of topByVotes) rankMaps.set(entry.movieId, { ...(rankMaps.get(entry.movieId) ?? {}), votes: entry.rank });
    for (const entry of topByRating) rankMaps.set(entry.movieId, { ...(rankMaps.get(entry.movieId) ?? {}), rating: entry.rank });
    for (const entry of topByHybrid) rankMaps.set(entry.movieId, { ...(rankMaps.get(entry.movieId) ?? {}), hybrid: entry.rank });

    const diagnoseExclusion = (movieId: string): {
      reason: string;
      details: string[];
      suggestedAction: string;
      bestNode?: { nodeSlug: string; nodeScore: number; qualityFloor: number };
    } => {
      const row = scoredByMovieId.get(movieId)!;
      const eligibilityFail = firstEligibilityFailReason(row.eligibility);
      if (eligibilityFail) {
        return {
          reason: eligibilityFail,
          details: [
            `missingPoster=${row.eligibility.missingPoster}`,
            `missingRatings=${row.eligibility.missingRatings}`,
            `missingReception=${row.eligibility.missingReception}`,
            `missingCredits=${row.eligibility.missingCredits}`,
          ],
          suggestedAction: 'fix_ingestion_or_metadata_completeness',
        };
      }
      if (!row.journey.pass) {
        return {
          reason: `journey_gate_fail:${row.journey.result.reasons[0] ?? 'score_below_threshold'}`,
          details: [
            `journeyScore=${round6(row.journey.result.score)}`,
            `threshold=${round6(row.journey.threshold)}`,
            `reasons=${row.journey.result.reasons.join(',') || 'none'}`,
          ],
          suggestedAction: 'improve_journey_signals_or_manual_curate',
        };
      }
      const scores = scoreCache.get(movieId) ?? [];
      const best = scores[0];
      if (!best) {
        return {
          reason: 'no_node_scores',
          details: [],
          suggestedAction: 'verify_ontology_and_lf_configuration',
        };
      }
      const qualityFloor = resolvePerNodeQualityFloor(SEASON1_NODE_GOVERNANCE_CONFIG, best.nodeSlug);
      if (best.finalScore < qualityFloor) {
        return {
          reason: 'node_score_below_quality_floor',
          details: [`bestNode=${best.nodeSlug}`, `bestScore=${best.finalScore}`, `qualityFloor=${qualityFloor}`],
          suggestedAction: 'expand_prototypes_or_ontology_keywords_for_node',
          bestNode: { nodeSlug: best.nodeSlug, nodeScore: best.finalScore, qualityFloor },
        };
      }
      return {
        reason: 'likely_excluded_by_extended_cap_or_overlap_constraints',
        details: [`bestNode=${best.nodeSlug}`, `bestScore=${best.finalScore}`, `qualityFloor=${qualityFloor}`],
        suggestedAction: 'increase_max_extended_or_review_overlap_constraints',
        bestNode: { nodeSlug: best.nodeSlug, nodeScore: best.finalScore, qualityFloor },
      };
    };

    const omissionsRanked = [...rankMaps.entries()]
      .filter(([movieId]) => !totalSnapshotMovieIds.has(movieId))
      .map(([movieId, ranks]) => {
        const row = scoredByMovieId.get(movieId)!;
        const rankScore = [
          ranks.votes ? 1 - ((ranks.votes - 1) / 500) : 0,
          ranks.rating ? 1 - ((ranks.rating - 1) / 500) : 0,
          ranks.hybrid ? 1 - ((ranks.hybrid - 1) / 500) : 0,
        ];
        const priority = round6((Math.max(...rankScore) * 0.45) + (row.metrics.hybridScore * 0.35) + (row.metrics.journeyScore * 0.2));
        const exclusion = diagnoseExclusion(movieId);
        return {
          movieId,
          tmdbId: row.movie.tmdbId,
          title: row.movie.title,
          year: row.movie.year,
          rankPositions: ranks,
          priority,
          voteCount: row.metrics.voteCount,
          rating: row.metrics.rating,
          popularity: row.metrics.popularity,
          journeyScore: row.metrics.journeyScore,
          horrorSignals: { genres: row.movie.genres.slice(0, 6), keywords: row.movie.keywords.slice(0, 8) },
          exclusionReason: exclusion.reason,
          exclusionDetails: exclusion.details,
          suggestedAction: exclusion.suggestedAction,
          bestNode: exclusion.bestNode ?? null,
        };
      })
      .sort((a, b) => (b.priority - a.priority) || (b.voteCount - a.voteCount) || a.title.localeCompare(b.title));
    const top50Omissions = omissionsRanked.slice(0, 50);
    const top100Omissions = omissionsRanked.slice(0, 100);
    const omissionsToplists = { snapshot: snapshotSummary, toplistCoverage, top50Omissions, top100Omissions };

    const omissionTriage = {
      snapshot: snapshotSummary,
      triageDefinitions: {
        A: 'not_horror_or_out_of_scope',
        B: 'horror_missing_credits_or_metadata',
        C: 'horror_eligible_nodeScore_below_floor',
        D: 'horror_not_in_catalog_pool',
      },
      top100: top100Omissions.map((entry) => {
        const row = scoredByMovieId.get(entry.movieId);
        if (!row) {
          return {
            ...entry,
            triageClass: 'D',
            triageLabel: 'horror_not_in_catalog_pool',
            triageReason: 'movie_not_found_in_catalog_rows',
          };
        }
        const strictHorror = hasStrictHorrorSignals(row.movie);
        const missingMeta = hasMissingCreditsOrMetadata(row);
        const missingEligibility = !row.eligibility.isEligible && (
          row.eligibility.missingCredits || row.eligibility.missingPoster || row.eligibility.missingRatings || row.eligibility.missingReception
        );
        const journeyMetadataFail = entry.exclusionReason.includes('journey_gate_fail:missing_metadata');

        if (!strictHorror) {
          return {
            ...entry,
            triageClass: 'A',
            triageLabel: 'not_horror_or_out_of_scope',
            triageReason: 'no_strict_horror_genre_or_keyword_signals',
          };
        }
        if (missingEligibility || missingMeta || journeyMetadataFail) {
          return {
            ...entry,
            triageClass: 'B',
            triageLabel: 'horror_missing_credits_or_metadata',
            triageReason: missingEligibility
              ? 'eligibility_missing_required_metadata'
              : (journeyMetadataFail ? 'journey_gate_missing_metadata' : 'incomplete_core_metadata'),
          };
        }
        if (entry.exclusionReason === 'node_score_below_quality_floor') {
          return {
            ...entry,
            triageClass: 'C',
            triageLabel: 'horror_eligible_nodeScore_below_floor',
            triageReason: 'needs_node_signal_improvement_prototypes_or_lfs',
          };
        }
        if (row.horrorTagged && row.eligibility.isEligible && row.journey.pass) {
          return {
            ...entry,
            triageClass: 'C',
            triageLabel: 'horror_eligible_nodeScore_below_floor',
            triageReason: 'horror_eligible_but_excluded_by_non_metadata_constraints',
          };
        }
        return {
          ...entry,
          triageClass: 'D',
          triageLabel: 'horror_not_in_catalog_pool',
          triageReason: 'missing_from_horror_catalog_pool_or_unscorable',
        };
      }),
    };
    const triageCounts = omissionTriage.top100.reduce((acc, row) => {
      acc[row.triageClass] = (acc[row.triageClass] ?? 0) + 1;
      return acc;
    }, { A: 0, B: 0, C: 0, D: 0 } as Record<'A' | 'B' | 'C' | 'D', number>);
    const omissionTriagePayload = {
      ...omissionTriage,
      counts: triageCounts,
    };

    const assignedMovieIdsByNode = new Map<string, Set<string>>();
    for (const nodeSlug of nodeSlugs) assignedMovieIdsByNode.set(nodeSlug, new Set<string>());
    for (const row of tieredRows) {
      const set = assignedMovieIdsByNode.get(row.node.slug) ?? new Set<string>();
      set.add(row.movieId);
      assignedMovieIdsByNode.set(row.node.slug, set);
    }
    const omissionsByNode = {
      snapshot: snapshotSummary,
      nodes: Object.fromEntries(nodeSlugs.map((nodeSlug) => {
        const qualityFloor = resolvePerNodeQualityFloor(SEASON1_NODE_GOVERNANCE_CONFIG, nodeSlug);
        const floorMin = qualityFloor - 0.02;
        const assignedSet = assignedMovieIdsByNode.get(nodeSlug) ?? new Set<string>();
        const nearMisses = candidatePoolForScoring
          .map((row) => ({ row, nodeScore: scoreCache.get(row.movie.id)?.find((score) => score.nodeSlug === nodeSlug)?.finalScore ?? 0 }))
          .filter((entry) => !assignedSet.has(entry.row.movie.id))
          .filter((entry) => entry.nodeScore >= floorMin && entry.nodeScore < qualityFloor)
          .sort((a, b) => ((b.nodeScore + b.row.metrics.journeyScore) - (a.nodeScore + a.row.metrics.journeyScore))
            || (b.row.metrics.voteCount - a.row.metrics.voteCount)
            || a.row.movie.title.localeCompare(b.row.movie.title))
          .slice(0, 50)
          .map((entry) => ({
            movieId: entry.row.movie.id,
            tmdbId: entry.row.movie.tmdbId,
            title: entry.row.movie.title,
            year: entry.row.movie.year,
            nodeScore: round6(entry.nodeScore),
            qualityFloor,
            journeyScore: entry.row.metrics.journeyScore,
            voteCount: entry.row.metrics.voteCount,
            rating: entry.row.metrics.rating,
          }));
        return [nodeSlug, { qualityFloor, nearMissWindow: [round6(floorMin), qualityFloor], nearMissCount: nearMisses.length, topNearMisses: nearMisses }];
      })),
    };

    const runtimePresent = horrorPool.filter((row) => (row.movie.runtimeMinutes ?? 0) > 0).length;
    const votePresent = horrorPool.filter((row) => row.metrics.voteCount > 0).length;
    const ratingPresent = horrorPool.filter((row) => row.metrics.rating > 0).length;
    const creditsPresent = horrorPool.filter((row) => {
      const hasDirector = typeof row.movie.director === 'string' && row.movie.director.trim().length > 0;
      const cast = Array.isArray(row.movie.castTop) ? row.movie.castTop : [];
      const hasCast = cast.some((entry) => {
        if (typeof entry === 'string') return entry.trim().length > 0;
        return Boolean(entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string' && (entry as { name: string }).name.trim().length > 0);
      });
      return hasDirector && hasCast;
    }).length;
    const receptionPresent = horrorPool.filter((row) => row.metrics.receptionCount > 0).length;
    const scoreDistribution = {
      snapshot: snapshotSummary,
      horrorPoolSize: horrorPool.length,
      fieldCoverage: {
        runtime: { count: runtimePresent, pct: toPct(runtimePresent, horrorPool.length), safeForHardGating: toPct(runtimePresent, horrorPool.length) >= 80 },
        voteCount: { count: votePresent, pct: toPct(votePresent, horrorPool.length), safeForHardGating: toPct(votePresent, horrorPool.length) >= 90 },
        rating: { count: ratingPresent, pct: toPct(ratingPresent, horrorPool.length), safeForHardGating: toPct(ratingPresent, horrorPool.length) >= 90 },
        directorAndCastTop: { count: creditsPresent, pct: toPct(creditsPresent, horrorPool.length), safeForHardGating: toPct(creditsPresent, horrorPool.length) >= 85 },
        receptionCount: { count: receptionPresent, pct: toPct(receptionPresent, horrorPool.length), safeForHardGating: toPct(receptionPresent, horrorPool.length) >= 70 },
      },
      distributions: {
        journeyScore: quantiles(horrorPool.map((row) => row.metrics.journeyScore)),
        hybridScore: quantiles(horrorPool.map((row) => row.metrics.hybridScore)),
        voteCount: quantiles(horrorPool.map((row) => row.metrics.voteCount)),
        rating: quantiles(horrorPool.map((row) => row.metrics.rating)),
      },
    };

    const cliffPressureNodes = Object.entries(nodeCoreBoundaries.nodes)
      .filter(([, node]) => node.scoreDelta !== null && node.scoreDelta < 0.01 && node.capPressure > 15)
      .map(([slug, node]) => ({ nodeSlug: slug, scoreDelta: node.scoreDelta, capPressure: node.capPressure }));
    const mustFix: string[] = [];
    for (const [field, coverage] of Object.entries(scoreDistribution.fieldCoverage)) {
      if (!coverage.safeForHardGating) mustFix.push(`${field}_coverage_low:${coverage.pct}%`);
    }
    const topListLowCoverage = toplistCoverage.filter((row) => row.coveragePercentTotalSnapshot < 60);
    for (const item of topListLowCoverage) {
      mustFix.push(`low_snapshot_coverage_${item.name}:${item.coveragePercentTotalSnapshot}%`);
    }
    const niceToImprove: string[] = [
      ...cliffPressureNodes.map((row) => `high_cap_pressure:${row.nodeSlug}:delta=${row.scoreDelta}:pressure=${row.capPressure}`),
      ...Object.entries(nodeCoreBoundaries.nodes)
        .filter(([, node]) => node.coreCount < Math.floor(node.targetSize * 0.7))
        .map(([slug, node]) => `underfilled_core:${slug}:${node.coreCount}/${node.targetSize}`),
    ];
    const recommendations = {
      snapshot: snapshotSummary,
      mustFixBeforePublish: [...new Set(mustFix)],
      niceToImprove: [...new Set(niceToImprove)],
      manualCurationList: omissionsRanked.slice(0, 30).map((row) => ({
        tmdbId: row.tmdbId,
        title: row.title,
        year: row.year,
        exclusionReason: row.exclusionReason,
        suggestedAction: row.suggestedAction,
      })),
    };

    const artifacts = [
      ['snapshot-summary.json', snapshotSummary],
      ['node-core-boundaries.json', nodeCoreBoundaries],
      ['omissions-toplists.json', omissionsToplists],
      ['omission-triage.json', omissionTriagePayload],
      ['omissions-by-node.json', omissionsByNode],
      ['score-distribution.json', scoreDistribution],
      ['recommendations.json', recommendations],
    ] as const;
    for (const [name, payload] of artifacts) {
      await writeFile(resolve(cli.outputDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    }

    const reportPath = resolve('docs/season1-best-movie-coverage-audit.md');
    const markdown = [
      '# Season 1 Best-Movie Coverage Audit',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Artifact directory: \`${cli.outputDir}\``,
      '',
      '## Snapshot Summary',
      '',
      `- Release ID: \`${snapshotSummary.release.releaseId}\``,
      `- Run ID: \`${snapshotSummary.release.runId}\``,
      `- Taxonomy Version: \`${snapshotSummary.release.taxonomyVersion}\``,
      `- Core unique movies: **${snapshotSummary.counts.coreUniqueMovies}**`,
      `- Extended unique movies: **${snapshotSummary.counts.extendedUniqueMovies}**`,
      `- Extended unique only movies: **${snapshotSummary.counts.extendedUniqueOnlyMovies}**`,
      `- Total unique movies: **${snapshotSummary.counts.totalUniqueMovies}**`,
      '',
      '## Top List Coverage',
      '',
      '| Top List | In Core | In Extended | Not In Snapshot | Core % | Total Snapshot % |',
      '|---|---:|---:|---:|---:|---:|',
      ...toplistCoverage.map((row) => `| ${row.name} | ${row.countInCore} | ${row.countInExtended} | ${row.countNotInSnapshot} | ${row.coveragePercentCore.toFixed(2)} | ${row.coveragePercentTotalSnapshot.toFixed(2)} |`),
      '',
      '## Top 20 Omitted High-Quality Titles',
      '',
      ...omissionsRanked.slice(0, 20).map((row, idx) =>
        `${idx + 1}. ${row.title}${row.year ? ` (${row.year})` : ''} - rating ${row.rating}, votes ${row.voteCount}, reason: \`${row.exclusionReason}\``),
      '',
      '## Omission Triage (Top 100)',
      '',
      '- A) not horror / out of scope: **' + triageCounts.A + '**',
      '- B) horror but missing credits/metadata: **' + triageCounts.B + '**',
      '- C) horror and eligible but nodeScore too low: **' + triageCounts.C + '**',
      '- D) horror but not in catalog pool: **' + triageCounts.D + '**',
      '',
      '## Recommendations',
      '',
      '### Must Fix Before Publish',
      ...((recommendations.mustFixBeforePublish.length > 0) ? recommendations.mustFixBeforePublish.map((item) => `- ${item}`) : ['- none identified']),
      '',
      '### Nice To Improve',
      ...((recommendations.niceToImprove.length > 0) ? recommendations.niceToImprove.map((item) => `- ${item}`) : ['- none identified']),
      '',
      '### Manual Curation Candidates',
      ...recommendations.manualCurationList.slice(0, 20).map((item) => `- ${item.title}${item.year ? ` (${item.year})` : ''} - ${item.exclusionReason}`),
      '',
      '## Artifact Files',
      '',
      '- `snapshot-summary.json`',
      '- `node-core-boundaries.json`',
      '- `omissions-toplists.json`',
      '- `omission-triage.json`',
      '- `omissions-by-node.json`',
      '- `score-distribution.json`',
      '- `recommendations.json`',
    ].join('\n');
    await writeFile(reportPath, `${markdown}\n`, 'utf8');

    const top10Omissions = omissionsRanked.slice(0, 10).map((row) => `${row.title}${row.year ? ` (${row.year})` : ''}`);
    console.log(JSON.stringify({
      snapshot: {
        coreUniqueMovies: snapshotSummary.counts.coreUniqueMovies,
        extendedUniqueMovies: snapshotSummary.counts.extendedUniqueMovies,
        extendedUniqueOnlyMovies: snapshotSummary.counts.extendedUniqueOnlyMovies,
        totalUniqueMovies: snapshotSummary.counts.totalUniqueMovies,
      },
      topListCoverage: toplistCoverage.map((row) => ({
        name: row.name,
        coveragePercentCore: row.coveragePercentCore,
        coveragePercentTotalSnapshot: row.coveragePercentTotalSnapshot,
      })),
      top10Omissions,
      nextActions: [...recommendations.mustFixBeforePublish.slice(0, 3), ...recommendations.niceToImprove.slice(0, 2)].slice(0, 5),
      artifactsDir: cli.outputDir,
      reportPath,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 best-movie coverage audit failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
