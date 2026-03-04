import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  buildSeason1LabelingFunctions,
  type LabelingFunction,
} from '../src/lib/nodes/weak-supervision/index.ts';
import {
  loadSeason1ClassifierArtifact,
  scoreMovieWithSeason1Classifier,
  type Season1NodeClassifierArtifact,
} from '../src/lib/nodes/classifier/index.ts';
import { evaluateCurriculumEligibility } from '../src/lib/curriculum/eligibility.ts';
import {
  applySeason1GovernanceEnvOverrides,
  resolvePerNodeCoreMaxPerNode,
  resolvePerNodeCoreMinScoreAbsolute,
  resolvePerNodeCorePickPercentile,
  loadSeason1NodeGovernanceConfig,
  resolvePerNodeCoreThreshold,
  resolvePerNodeMaxExtended,
  resolvePerNodeMinEligible,
  resolvePerNodeQualityFloor,
  resolvePerNodeTargetSize,
  toPairKey,
} from '../src/lib/nodes/governance/season1-governance.ts';
import { createSeasonNodeReleaseFromNodeMovie } from '../src/lib/nodes/governance/release-artifact.ts';
import { scoreMovieForNodes } from '../src/lib/nodes/scoring/scoreMovieForNodes.ts';
import { computeJourneyWorthiness, type JourneyWorthinessMovieInput } from '../src/lib/journey/journey-worthiness.ts';
import {
  LOCAL_MOVIE_EMBEDDING_DIM,
  LOCAL_MOVIE_EMBEDDING_MODEL,
  computeLocalMovieEmbedding,
} from '../src/lib/movie/local-embedding.ts';
import { isLikelyLocalPostgresUrl } from './catalog-release-utils.ts';
import { getSeason1MustIncludeForNode } from '../src/config/seasons/season1-must-include.ts';
import { loadSeasonJourneyWorthinessConfig } from '../src/config/seasons/journey-worthiness.ts';

type CurriculumTitle = {
  title: string;
  year: number;
  altTitle?: string;
};

type CurriculumNode = {
  slug: string;
  name: string;
  titles: CurriculumTitle[];
};

type CurriculumSpec = {
  seasonSlug: string;
  packSlug: string;
  nodes: CurriculumNode[];
};

type CatalogMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  synopsis: string | null;
  genres: string[];
  keywords: string[];
  country: string | null;
  director: string | null;
  cast: string[];
  embeddingVector?: number[];
  popularity: number;
  ratings: Array<{ source: string; value: number; scale?: string }>;
  eligible: boolean;
};

type NodeAssignmentData = {
  nodeId: string;
  movieId: string;
  rank: number;
  tier: 'CORE' | 'EXTENDED';
  coreRank: number | null;
  source: 'curated' | 'weak_supervision';
  score: number | null;
  finalScore: number;
  journeyScore: number;
  evidence: Record<string, unknown>;
  runId: string;
  taxonomyVersion: string;
};

type WeakCandidate = {
  nodeSlug: string;
  nodeId: string;
  movie: CatalogMovie;
  rawProbability: number;
  classifierProbability: number | null;
  assistProbability: number;
  adjustedProbability: number;
  qualityFloor: number;
  coreThreshold: number;
  prototypeScore: number;
  finalScore: number;
  journeyScore: number;
  journeyPassCore: boolean;
  firedLfNames: string[];
  evidenceSummary: string[];
  positiveWeight: number;
  negativeWeight: number;
  penalties: Array<{ pairWith: string; amount: number; reason?: string }>;
};

type NodeSummary = {
  slug: string;
  requested: number;
  curatedAssigned: number;
  weakCoreAssigned: number;
  weakExtendedAssigned: number;
  assigned: number;
  coreCount: number;
  extendedCount: number;
  targetSize: number;
  minEligible: number;
  qualityFloor: number;
  coreThreshold: number;
  coreMinScoreUsed: number;
  pickedPercentileActual: number;
  eligibleWeak: number;
  excludedOnlyByOverlapForCore: number;
  belowMinFloor: boolean;
  unresolved: number;
};

type ExclusionReason =
  | 'eligibility_fail'
  | 'journey_fail_extended'
  | 'journey_fail_core'
  | 'node_score_below_floor'
  | 'dropped_due_max_extended_cap'
  | 'dropped_due_node_target'
  | 'dropped_due_max_nodes_per_movie'
  | 'dropped_due_disallowed_overlap'
  | 'dropped_due_core_threshold';

type ExclusionExample = {
  movieId: string;
  tmdbId: number;
  title: string;
  year: number | null;
  nodeSlug?: string;
  details?: string[];
};

type ExclusionBucket = {
  count: number;
  examples: ExclusionExample[];
  seen: Set<string>;
};

const SPEC_PATH = resolve('docs/season/season-1-horror-subgenre-curriculum.json');
const READINESS_PATH = resolve('docs/season/season-1-horror-subgenre-readiness.md');

const OBJECTIVE_BY_NODE: Record<string, string> = {
  'supernatural-horror': 'Explore non-scientific dread driven by hauntings, possession, and paranormal forces.',
  'psychological-horror': 'Analyze dread built from perception, paranoia, and unstable identity.',
  'slasher-serial-killer': 'Track the evolution of human threat design and slasher grammar.',
  'creature-monster': 'Understand monster and creature threats as cinematic fear engines.',
  'body-horror': 'Study transformation and physical corruption as thematic horror tools.',
  'cosmic-horror': 'Identify existential dread, unknown entities, and reality breakdown motifs.',
  'folk-horror': 'Examine ritual, landscape, and collective belief as horror vectors.',
  'sci-fi-horror': 'Follow fear emerging from science, technology, and non-human intelligence.',
  'found-footage': 'Read realism simulation, diegetic cameras, and fragmented evidence pacing.',
  'survival-horror': 'Evaluate endurance narratives under overwhelming threat conditions.',
  'apocalyptic-horror': 'Map collapse narratives and end-state horror structures.',
  'gothic-horror': 'Read atmosphere, architecture, and decaying legacy themes in gothic form.',
  'horror-comedy': 'Measure tonal blend between fear, absurdity, and satirical release.',
  'splatter-extreme': 'Understand transgressive and explicit shock aesthetics.',
  'social-domestic-horror': 'Analyze family, class, and social pressure as horror mechanisms.',
  'experimental-horror': 'Track non-traditional structure, imagery, and surreal horror language.',
};

const ERA_BY_NODE: Record<string, string> = {
  'supernatural-horror': '1960s-present · supernatural, paranormal, possession',
  'psychological-horror': '1960s-present · psychological, surreal, paranoia',
  'slasher-serial-killer': '1960s-present · slasher, serial killer, stalker',
  'creature-monster': '1930s-present · creature, monster, animal attack',
  'body-horror': '1970s-present · transformation, mutation, infection',
  'cosmic-horror': '1980s-present · existential, eldritch, reality collapse',
  'folk-horror': '1960s-present · pagan, ritual, rural dread',
  'sci-fi-horror': '1970s-present · alien, technology, bio-experiment',
  'found-footage': '1990s-present · found footage, screenlife, mockumentary',
  'survival-horror': '1970s-present · wilderness, siege, escape',
  'apocalyptic-horror': '1960s-present · outbreak, collapse, end-state dread',
  'gothic-horror': '1920s-present · gothic, period dread, haunted legacy',
  'horror-comedy': '1970s-present · satire, parody, absurdist horror',
  'splatter-extreme': '1980s-present · gore, extreme, transgressive',
  'social-domestic-horror': '1960s-present · domestic, social allegory, class fear',
  'experimental-horror': '1960s-present · surreal, avant-garde, nonlinear dread',
};

const SPOILER_BY_NODE: Record<string, 'NO_SPOILERS' | 'LIGHT' | 'FULL'> = {
  'splatter-extreme': 'LIGHT',
};

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
    .filter((entry) => entry.length > 0)
    .slice(0, 8);
}

function tokenizeTitle(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .slice(0, 6);
}

function synthesizedSynopsis(input: { title: string; year: number | null; genres: string[] }): string {
  const genreText = input.genres.length > 0 ? input.genres.slice(0, 4).join(', ') : 'horror';
  return `${input.title}${input.year ? ` (${input.year})` : ''} is a catalog title classified under ${genreText}.`;
}

function synthesizedKeywords(input: { title: string; genres: string[]; year: number | null }): string[] {
  const merged = [
    ...input.genres.map((genre) => genre.toLowerCase()),
    ...tokenizeTitle(input.title),
    ...(input.year ? [String(input.year)] : []),
  ];
  return [...new Set(merged)].slice(0, 24);
}

async function backfillCoreMovieMetadataForPack(prisma: PrismaClient, packId: string): Promise<void> {
  const movies = await prisma.movie.findMany({
    where: {
      nodeAssignments: {
        some: {
          node: { packId },
        },
      },
    },
    select: {
      id: true,
      title: true,
      year: true,
      synopsis: true,
      keywords: true,
      country: true,
      genres: true,
    },
  });

  for (const movie of movies) {
    const genres = parseJsonStringArray(movie.genres);
    const hasSynopsis = typeof movie.synopsis === 'string' && movie.synopsis.trim().length > 0;
    const hasKeywords = Array.isArray(movie.keywords) && movie.keywords.length > 0;
    const hasCountry = typeof movie.country === 'string' && movie.country.trim().length > 0;
    if (hasSynopsis && hasKeywords && hasCountry) {
      continue;
    }

    await prisma.movie.update({
      where: { id: movie.id },
      data: {
        ...(hasSynopsis ? {} : { synopsis: synthesizedSynopsis({ title: movie.title, year: movie.year, genres }) }),
        ...(hasKeywords ? {} : { keywords: synthesizedKeywords({ title: movie.title, genres, year: movie.year }) }),
        ...(hasCountry ? {} : { country: 'Unknown' }),
      },
    });
  }
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function toEligibilityFailReason(input: {
  missingPoster: boolean;
  missingRatings: boolean;
  missingReception: boolean;
  missingCredits: boolean;
}): string {
  if (input.missingCredits) return 'missing_credits';
  if (input.missingRatings) return 'missing_ratings';
  if (input.missingPoster) return 'missing_poster';
  if (input.missingReception) return 'missing_reception';
  return 'other';
}

function createExclusionCollector(enabled: boolean): {
  record: (reason: ExclusionReason, example: ExclusionExample) => void;
  toJson: () => Record<string, { count: number; examples: ExclusionExample[] }>;
} {
  const buckets = new Map<ExclusionReason, ExclusionBucket>();
  const record = (reason: ExclusionReason, example: ExclusionExample): void => {
    if (!enabled) return;
    const bucket = buckets.get(reason) ?? { count: 0, examples: [], seen: new Set<string>() };
    bucket.count += 1;
    const key = `${example.movieId}::${example.nodeSlug ?? '-'}`;
    if (!bucket.seen.has(key) && bucket.examples.length < 50) {
      bucket.examples.push(example);
      bucket.seen.add(key);
    }
    buckets.set(reason, bucket);
  };
  const toJson = (): Record<string, { count: number; examples: ExclusionExample[] }> => {
    const output: Record<string, { count: number; examples: ExclusionExample[] }> = {};
    const reasons: ExclusionReason[] = [
      'eligibility_fail',
      'journey_fail_extended',
      'journey_fail_core',
      'node_score_below_floor',
      'dropped_due_max_extended_cap',
      'dropped_due_node_target',
      'dropped_due_max_nodes_per_movie',
      'dropped_due_disallowed_overlap',
      'dropped_due_core_threshold',
    ];
    for (const reason of reasons) {
      const bucket = buckets.get(reason) ?? { count: 0, examples: [], seen: new Set<string>() };
      output[reason] = {
        count: bucket.count,
        examples: [...bucket.examples].sort((a, b) =>
          a.title.localeCompare(b.title) || (a.year ?? -1) - (b.year ?? -1) || a.tmdbId - b.tmdbId),
      };
    }
    return output;
  };
  return { record, toJson };
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeLookupKey(title: string, year: number | null): string {
  return `${normalizeTitle(title)}::${year ?? -1}`;
}

function mergeRequestedTitles(base: CurriculumTitle[], mustInclude: CurriculumTitle[]): CurriculumTitle[] {
  const merged: CurriculumTitle[] = [];
  const seen = new Set<string>();
  for (const title of [...base, ...mustInclude]) {
    const key = makeLookupKey(title.altTitle ?? title.title, title.year);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(title);
  }
  return merged;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function compareWeakCandidate(a: WeakCandidate, b: WeakCandidate): number {
  return (b.finalScore - a.finalScore)
    || (b.journeyScore - a.journeyScore)
    || (b.prototypeScore - a.prototypeScore)
    || (b.movie.popularity - a.movie.popularity)
    || (a.movie.tmdbId - b.movie.tmdbId);
}

function buildJourneyInput(movie: CatalogMovie): JourneyWorthinessMovieInput {
  const voteCount = movie.ratings.find((rating) => rating.source === 'TMDB_VOTE_COUNT')?.value
    ?? movie.ratings.find((rating) => rating.source === 'TMDB_VOTES')?.value
    ?? null;
  return {
    year: movie.year,
    runtimeMinutes: null,
    popularity: movie.popularity,
    voteCount,
    posterUrl: '',
    synopsis: movie.synopsis,
    director: movie.director,
    castTop: movie.cast,
    genres: movie.genres,
    keywords: movie.keywords,
    ratings: movie.ratings.map((rating) => ({
      source: rating.source,
      value: rating.value,
      scale: rating.scale,
    })),
  };
}

async function loadSpec(): Promise<CurriculumSpec> {
  const raw = await readFile(SPEC_PATH, 'utf8');
  return JSON.parse(raw) as CurriculumSpec;
}

function isPairMatch(a: string, b: string, left: string, right: string): boolean {
  return toPairKey(a, b) === toPairKey(left, right);
}

async function main(): Promise<void> {
  if (!isLikelyLocalPostgresUrl(process.env.DATABASE_URL)) {
    throw new Error('seed:season1:subgenres is local-only. Use remote:publish-catalog for remote writes.');
  }
  const prisma = new PrismaClient();
  const limitPerNode = parseIntEnv('SEASON1_REQUIRED_LIMIT_PER_NODE', 20);
  const runId = process.env.SEASON1_ASSIGNMENT_RUN_ID?.trim() || `season1-weak-supervision-${new Date().toISOString()}`;
  const publishSnapshot = parseBooleanEnv('SEASON1_PUBLISH_SNAPSHOT', false);
  const classifierAssistEnabled = parseBooleanEnv('SEASON1_CLASSIFIER_ASSIST_ENABLED', false);
  const classifierAssistWeight = Math.max(0, Math.min(0.8, parseFloatEnv('SEASON1_CLASSIFIER_ASSIST_WEIGHT', 0.25)));
  const buildDebugExclusions = parseBooleanEnv('SEASON1_BUILD_DEBUG_EXCLUSIONS', false);
  const debugOutputRoot = resolve(process.env.SEASON1_BUILD_DEBUG_DIR?.trim() || 'artifacts/season1/build-debug');
  const exclusionCollector = createExclusionCollector(buildDebugExclusions);

  try {
    const spec = await loadSpec();
    const configRaw = await loadSeason1NodeGovernanceConfig();
    const config = applySeason1GovernanceEnvOverrides(configRaw, spec.nodes.map((n) => n.slug));
    const journeyConfig = loadSeasonJourneyWorthinessConfig('season-1');
    const journeyMinCore = journeyConfig.gates?.journeyMinCore ?? 0.6;
    const journeyMinExtended = journeyConfig.gates?.journeyMinExtended ?? journeyMinCore;
    const classifierPath = resolve(
      process.env.SEASON1_CLASSIFIER_ARTIFACT_PATH?.trim()
        || `artifacts/season1-node-classifier/${config.taxonomyVersion}/model.json`,
    );
    let classifierArtifact: Season1NodeClassifierArtifact | null = null;
    if (classifierAssistEnabled) {
      try {
        classifierArtifact = await loadSeason1ClassifierArtifact(classifierPath);
      } catch (error) {
        console.warn(`Season 1 classifier assist disabled; artifact not loaded at ${classifierPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const season = await prisma.season.upsert({
      where: { slug: spec.seasonSlug },
      create: { slug: spec.seasonSlug, name: 'Season 1', isActive: true },
      update: {},
      select: { id: true, slug: true },
    });
    const pack = await prisma.genrePack.upsert({
      where: { slug: spec.packSlug },
      create: {
        slug: spec.packSlug,
        name: 'Horror',
        seasonId: season.id,
        isEnabled: true,
        primaryGenre: 'horror',
        description: 'Foundational horror journey pack.',
      },
      update: { seasonId: season.id },
      select: { id: true, slug: true },
    });

    const specNodeSlugs = spec.nodes.map((node) => node.slug);
    await prisma.journeyNode.deleteMany({
      where: {
        packId: pack.id,
        slug: { notIn: specNodeSlugs },
      },
    });

    const lfs: LabelingFunction[] = buildSeason1LabelingFunctions(specNodeSlugs);

    const allMoviesRaw = await prisma.movie.findMany({
      select: {
        id: true,
        tmdbId: true,
        title: true,
        year: true,
        synopsis: true,
        genres: true,
        keywords: true,
        country: true,
        posterUrl: true,
        director: true,
        castTop: true,
        embedding: { select: { vectorJson: true } },
        ratings: { select: { source: true, value: true, scale: true } },
      },
    });

    const embeddingUpserts: Array<{ movieId: string; vector: number[] }> = [];
    const allMovies: CatalogMovie[] = allMoviesRaw.map((movie) => {
      const genres = parseJsonStringArray(movie.genres);
      const keywords = parseJsonStringArray(movie.keywords);
      const cast = parseCastNames(movie.castTop);
      const persistedEmbedding = Array.isArray(movie.embedding?.vectorJson)
        ? movie.embedding.vectorJson.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
        : [];
      const embeddingVector = persistedEmbedding.length === LOCAL_MOVIE_EMBEDDING_DIM
        ? persistedEmbedding
        : computeLocalMovieEmbedding({
          title: movie.title,
          year: movie.year,
          synopsis: movie.synopsis,
          genres,
          keywords,
          director: movie.director,
          castTop: cast,
        }, LOCAL_MOVIE_EMBEDDING_DIM);
      if (persistedEmbedding.length !== LOCAL_MOVIE_EMBEDDING_DIM) {
        embeddingUpserts.push({
          movieId: movie.id,
          vector: embeddingVector,
        });
      }
      const eligibility = evaluateCurriculumEligibility({
        posterUrl: movie.posterUrl ?? '',
        director: movie.director,
        castTop: movie.castTop,
        ratings: movie.ratings.map((rating) => ({ source: rating.source })),
        hasStreamingData: false,
      });
      const popularity = movie.ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? 0;
      if (genres.includes('horror') && !eligibility.isEligible) {
        exclusionCollector.record('eligibility_fail', {
          movieId: movie.id,
          tmdbId: movie.tmdbId,
          title: movie.title,
          year: movie.year,
          details: [toEligibilityFailReason(eligibility)],
        });
      }
      return {
        id: movie.id,
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year,
        synopsis: movie.synopsis,
        genres,
        keywords,
        country: movie.country,
        director: movie.director,
        cast,
        embeddingVector,
        popularity,
        ratings: movie.ratings.map((rating) => ({
          source: rating.source,
          value: rating.value,
          scale: rating.scale ?? undefined,
        })),
        eligible: eligibility.isEligible,
      };
    });

    for (const upsert of embeddingUpserts) {
      await prisma.movieEmbedding.upsert({
        where: { movieId: upsert.movieId },
        create: {
          movieId: upsert.movieId,
          model: LOCAL_MOVIE_EMBEDDING_MODEL,
          dim: LOCAL_MOVIE_EMBEDDING_DIM,
          vectorJson: upsert.vector,
        },
        update: {
          model: LOCAL_MOVIE_EMBEDDING_MODEL,
          dim: LOCAL_MOVIE_EMBEDDING_DIM,
          vectorJson: upsert.vector,
        },
      });
    }

    const eligibleHorrorPool = allMovies.filter((movie) => movie.eligible && movie.genres.includes('horror'));
    const movieByLookup = new Map(allMovies.map((movie) => [makeLookupKey(movie.title, movie.year), movie] as const));
    const classifierByMovie = new Map<string, Map<string, number>>();
    if (classifierArtifact) {
      for (const movie of eligibleHorrorPool) {
        const scored = scoreMovieWithSeason1Classifier(classifierArtifact, movie);
        classifierByMovie.set(movie.id, new Map(scored.map((item) => [item.nodeSlug, item.probability] as const)));
      }
    }

    const unresolved: Array<{ nodeSlug: string; title: string; year: number; reason: string }> = [];
    const nodeBySlug = new Map<string, { id: string; name: string }>();
    const curatedByNode = new Map<string, NodeAssignmentData[]>();
    const weakCandidatesByNode = new Map<string, WeakCandidate[]>();
    const fixedAssignmentsByMovie = new Map<string, Set<string>>();

    for (const [index, node] of spec.nodes.entries()) {
      const upsertedNode = await prisma.journeyNode.upsert({
        where: { packId_slug: { packId: pack.id, slug: node.slug } },
        create: {
          packId: pack.id,
          slug: node.slug,
          name: node.name,
          taxonomyVersion: config.taxonomyVersion,
          learningObjective: OBJECTIVE_BY_NODE[node.slug] ?? `${node.name} learning objective.`,
          whatToNotice: [
            'How tension is constructed',
            'How genre conventions are applied or subverted',
            'How tone and pacing shape audience response',
          ],
          eraSubgenreFocus: ERA_BY_NODE[node.slug] ?? 'Horror subgenre study',
          spoilerPolicyDefault: SPOILER_BY_NODE[node.slug] ?? 'NO_SPOILERS',
          orderIndex: index + 1,
        },
        update: {
          name: node.name,
          taxonomyVersion: config.taxonomyVersion,
          learningObjective: OBJECTIVE_BY_NODE[node.slug] ?? `${node.name} learning objective.`,
          eraSubgenreFocus: ERA_BY_NODE[node.slug] ?? 'Horror subgenre study',
          spoilerPolicyDefault: SPOILER_BY_NODE[node.slug] ?? 'NO_SPOILERS',
          orderIndex: index + 1,
        },
        select: { id: true },
      });

      nodeBySlug.set(node.slug, { id: upsertedNode.id, name: node.name });

      const requestedTitles = mergeRequestedTitles(
        node.titles.slice(0, limitPerNode),
        getSeason1MustIncludeForNode(node.slug).map((entry) => ({
          title: entry.title,
          year: entry.year,
          ...(entry.altTitle ? { altTitle: entry.altTitle } : {}),
        })),
      );
      const curatedAssignments: NodeAssignmentData[] = [];
      const curatedMovieIds = new Set<string>();

      for (const required of requestedTitles) {
        const lookupCandidates = [required.title, required.altTitle]
          .filter((value): value is string => typeof value === 'string')
          .map((value) => makeLookupKey(value, required.year));

        const found = lookupCandidates
          .map((key) => movieByLookup.get(key))
          .find((movie): movie is CatalogMovie => Boolean(movie));

        if (!found) {
          unresolved.push({
            nodeSlug: node.slug,
            title: required.title,
            year: required.year,
            reason: 'not found in local catalog',
          });
          continue;
        }
        if (!found.eligible) {
          unresolved.push({
            nodeSlug: node.slug,
            title: required.title,
            year: required.year,
            reason: 'fails hard eligibility',
          });
          continue;
        }

        curatedMovieIds.add(found.id);
        curatedAssignments.push({
          nodeId: upsertedNode.id,
          movieId: found.id,
          rank: 0,
          tier: 'CORE',
          coreRank: 0,
          source: 'curated',
          score: 1,
          finalScore: 1,
          journeyScore: 1,
          evidence: {
            anchor: `${required.title} (${required.year})`,
            matchTitle: found.title,
            matchYear: found.year,
          },
          runId,
          taxonomyVersion: config.taxonomyVersion,
        });

        const movieSet = fixedAssignmentsByMovie.get(found.id) ?? new Set<string>();
        movieSet.add(node.slug);
        fixedAssignmentsByMovie.set(found.id, movieSet);
      }

      curatedByNode.set(node.slug, curatedAssignments);

      const qualityFloor = resolvePerNodeQualityFloor(config, node.slug);
      const coreThreshold = resolvePerNodeCoreThreshold(config, node.slug);
      const weakCandidates = eligibleHorrorPool
        .filter((movie) => !curatedMovieIds.has(movie.id))
        .map((movie) => {
          const scored = scoreMovieForNodes({
            seasonId: 'season-1',
            movie: {
              id: movie.id,
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              genres: movie.genres,
              keywords: movie.keywords,
              synopsis: movie.synopsis,
            },
            movieEmbedding: movie.embeddingVector,
            nodeSlugs: [node.slug],
            lfs,
          })[0]!;
          const classifierProbability = classifierByMovie.get(movie.id)?.get(node.slug) ?? null;
          const assistProbability = classifierProbability === null
            ? scored.finalScore
            : ((1 - classifierAssistWeight) * scored.finalScore) + (classifierAssistWeight * classifierProbability);
          const journeyResult = computeJourneyWorthiness(buildJourneyInput(movie), 'season-1');
          const journeyPassExtended = journeyResult.score >= journeyMinExtended;
          const journeyPassCore = journeyResult.score >= journeyMinCore;
          if (!journeyPassExtended) {
            exclusionCollector.record('journey_fail_extended', {
              movieId: movie.id,
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              nodeSlug: node.slug,
              details: [`journeyScore=${journeyResult.score}`, `journeyMinExtended=${journeyMinExtended}`],
            });
          }
          if (scored.finalScore < qualityFloor) {
            exclusionCollector.record('node_score_below_floor', {
              movieId: movie.id,
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              nodeSlug: node.slug,
              details: [`finalScore=${scored.finalScore}`, `qualityFloor=${qualityFloor}`],
            });
          }
          return {
            movie,
            rawProbability: scored.weakScore,
            classifierProbability,
            assistProbability,
            qualityFloor,
            coreThreshold,
            prototypeScore: scored.prototypeScore,
            finalScore: scored.finalScore,
            journeyScore: journeyResult.score,
            journeyPassExtended,
            journeyPassCore,
            firedLfNames: scored.evidence.weak.firedLfNames.slice(0, 8),
            evidenceSummary: scored.evidence.weak.firedLfNames.slice(0, 4),
            positiveWeight: Number(scored.evidence.weak.positiveWeight.toFixed(4)),
            negativeWeight: Number(scored.evidence.weak.negativeWeight.toFixed(4)),
          };
        })
        .filter((entry) => entry.finalScore >= qualityFloor && entry.journeyPassExtended)
        .sort((a, b) => (b.finalScore - a.finalScore) || (b.journeyScore - a.journeyScore) || (b.prototypeScore - a.prototypeScore) || (b.movie.popularity - a.movie.popularity) || (a.movie.tmdbId - b.movie.tmdbId))
        .map((entry) => ({
          nodeSlug: node.slug,
          nodeId: upsertedNode.id,
          movie: entry.movie,
          rawProbability: Number(entry.rawProbability.toFixed(6)),
          classifierProbability: entry.classifierProbability === null ? null : Number(entry.classifierProbability.toFixed(6)),
          assistProbability: Number(entry.assistProbability.toFixed(6)),
          adjustedProbability: Number(entry.finalScore.toFixed(6)),
          qualityFloor: entry.qualityFloor,
          coreThreshold: entry.coreThreshold,
          prototypeScore: Number(entry.prototypeScore.toFixed(6)),
          finalScore: Number(entry.finalScore.toFixed(6)),
          journeyScore: Number(entry.journeyScore.toFixed(6)),
          journeyPassCore: entry.journeyPassCore,
          firedLfNames: entry.firedLfNames,
          evidenceSummary: entry.evidenceSummary,
          positiveWeight: entry.positiveWeight,
          negativeWeight: entry.negativeWeight,
          penalties: [],
        }));

      weakCandidatesByNode.set(node.slug, weakCandidates);
    }

    const disallowed = config.overlapConstraints.disallowedPairs;
    const maxNodesPerMovie = config.defaults.maxNodesPerMovie;

    const workingAssignmentsByMovie = new Map<string, Set<string>>();
    for (const [movieId, fixed] of fixedAssignmentsByMovie.entries()) {
      workingAssignmentsByMovie.set(movieId, new Set(fixed));
    }

    const nodeSelectedWeak = new Map<string, WeakCandidate[]>();
    const nodeExtendedPool = new Map<string, WeakCandidate[]>();
    const corePickedPercentileActualByNode = new Map<string, number>();
    const coreMinScoreUsedByNode = new Map<string, number>();
    for (const nodeSlug of specNodeSlugs) {
      const pool = (weakCandidatesByNode.get(nodeSlug) ?? [])
        .sort(compareWeakCandidate);
      const maxExtended = resolvePerNodeMaxExtended(config, nodeSlug);
      if (typeof maxExtended === 'number' && pool.length > maxExtended) {
        for (const dropped of pool.slice(maxExtended)) {
          exclusionCollector.record('dropped_due_max_extended_cap', {
            movieId: dropped.movie.id,
            tmdbId: dropped.movie.tmdbId,
            title: dropped.movie.title,
            year: dropped.movie.year,
            nodeSlug,
            details: [`maxExtended=${maxExtended}`],
          });
        }
      }
      nodeExtendedPool.set(nodeSlug, maxExtended === null ? pool : pool.slice(0, maxExtended));
    }

    const coreSelectedKey = new Set<string>();
    const coreOverlapExcludedByNode = new Map<string, number>(specNodeSlugs.map((slug) => [slug, 0] as const));
    const targetByNode = new Map<string, number>(
      specNodeSlugs.map((slug) => [slug, resolvePerNodeTargetSize(config, slug)] as const),
    );
    const RELAXATION_DELTA = 0.03;
    const RELAXATION_MIN_PROTOTYPE = 0.72;

    for (const nodeSlug of specNodeSlugs) {
      const extendedPool = nodeExtendedPool.get(nodeSlug) ?? [];
      const target = targetByNode.get(nodeSlug) ?? 0;
      const coreMaxPerNode = resolvePerNodeCoreMaxPerNode(config, nodeSlug);
      const curatedCount = curatedByNode.get(nodeSlug)?.length ?? 0;
      const weakTarget = Math.max(0, Math.min(target, coreMaxPerNode) - curatedCount);
      const nodeList = nodeSelectedWeak.get(nodeSlug) ?? [];
      if (weakTarget <= 0 || extendedPool.length === 0) {
        corePickedPercentileActualByNode.set(nodeSlug, 0);
        coreMinScoreUsedByNode.set(nodeSlug, resolvePerNodeCoreMinScoreAbsolute(config, nodeSlug));
        continue;
      }

      for (const candidate of extendedPool) {
        if (candidate.journeyPassCore && candidate.journeyScore >= journeyMinCore) {
          continue;
        }
        exclusionCollector.record('journey_fail_core', {
          movieId: candidate.movie.id,
          tmdbId: candidate.movie.tmdbId,
          title: candidate.movie.title,
          year: candidate.movie.year,
          nodeSlug: candidate.nodeSlug,
          details: [`journeyScore=${candidate.journeyScore}`, `journeyMinCore=${journeyMinCore}`],
        });
      }

      const coreCandidates = extendedPool
        .filter((candidate) => candidate.journeyPassCore && candidate.journeyScore >= journeyMinCore)
        .sort(compareWeakCandidate);
      const pickPercentile = clamp01(resolvePerNodeCorePickPercentile(config, nodeSlug));
      const absoluteFloor = resolvePerNodeCoreMinScoreAbsolute(config, nodeSlug);
      const percentileRank = Math.max(1, Math.ceil(coreCandidates.length * pickPercentile));
      const percentileFloor = coreCandidates[Math.min(coreCandidates.length, percentileRank) - 1]?.finalScore ?? 1;
      const calibratedFloor = Math.max(absoluteFloor, percentileFloor);
      const relaxedFloor = Math.max(0, absoluteFloor - RELAXATION_DELTA);
      const scarceNode = coreCandidates.filter((candidate) => candidate.finalScore >= calibratedFloor).length < weakTarget;

      let minScoreUsedForPicks = calibratedFloor;

      const trySelectCandidate = (candidate: WeakCandidate): boolean => {
        const key = `${candidate.nodeSlug}::${candidate.movie.id}`;
        if (coreSelectedKey.has(key)) {
          return false;
        }
        if ((curatedCount + nodeList.length) >= Math.min(target, coreMaxPerNode)) {
          exclusionCollector.record('dropped_due_node_target', {
            movieId: candidate.movie.id,
            tmdbId: candidate.movie.tmdbId,
            title: candidate.movie.title,
            year: candidate.movie.year,
            nodeSlug: candidate.nodeSlug,
            details: [`target=${Math.min(target, coreMaxPerNode)}`],
          });
          return false;
        }
        const movieSet = workingAssignmentsByMovie.get(candidate.movie.id) ?? new Set<string>();
        if (movieSet.has(candidate.nodeSlug)) {
          return false;
        }
        if (movieSet.size >= maxNodesPerMovie) {
          exclusionCollector.record('dropped_due_max_nodes_per_movie', {
            movieId: candidate.movie.id,
            tmdbId: candidate.movie.tmdbId,
            title: candidate.movie.title,
            year: candidate.movie.year,
            nodeSlug: candidate.nodeSlug,
            details: [`maxNodesPerMovie=${maxNodesPerMovie}`],
          });
          return false;
        }
        const disallowedConflict = [...movieSet].some((existingSlug) =>
          disallowed.some(([a, b]) => isPairMatch(a, b, existingSlug, candidate.nodeSlug)));
        if (disallowedConflict) {
          exclusionCollector.record('dropped_due_disallowed_overlap', {
            movieId: candidate.movie.id,
            tmdbId: candidate.movie.tmdbId,
            title: candidate.movie.title,
            year: candidate.movie.year,
            nodeSlug: candidate.nodeSlug,
          });
          coreOverlapExcludedByNode.set(
            candidate.nodeSlug,
            (coreOverlapExcludedByNode.get(candidate.nodeSlug) ?? 0) + 1,
          );
          return false;
        }
        nodeList.push({
          ...candidate,
          penalties: [],
          adjustedProbability: candidate.finalScore,
        });
        nodeSelectedWeak.set(candidate.nodeSlug, nodeList);
        movieSet.add(candidate.nodeSlug);
        workingAssignmentsByMovie.set(candidate.movie.id, movieSet);
        coreSelectedKey.add(key);
        return true;
      };

      for (const candidate of coreCandidates) {
        if (nodeList.length >= weakTarget) {
          break;
        }
        if (candidate.finalScore < calibratedFloor) {
          exclusionCollector.record('dropped_due_core_threshold', {
            movieId: candidate.movie.id,
            tmdbId: candidate.movie.tmdbId,
            title: candidate.movie.title,
            year: candidate.movie.year,
            nodeSlug: candidate.nodeSlug,
            details: [
              `finalScore=${candidate.finalScore}`,
              `coreMinScoreAbsolute=${absoluteFloor}`,
              `percentileFloor=${percentileFloor}`,
              `calibratedFloor=${calibratedFloor}`,
            ],
          });
          continue;
        }
        trySelectCandidate(candidate);
      }

      if (scarceNode && nodeList.length < weakTarget) {
        for (const candidate of coreCandidates) {
          if (nodeList.length >= weakTarget) {
            break;
          }
          if (candidate.finalScore >= calibratedFloor) {
            continue;
          }
          if (candidate.finalScore < relaxedFloor) {
            continue;
          }
          if (candidate.prototypeScore < RELAXATION_MIN_PROTOTYPE) {
            continue;
          }
          const selected = trySelectCandidate(candidate);
          if (selected) {
            minScoreUsedForPicks = Math.min(minScoreUsedForPicks, candidate.finalScore);
          }
        }
      }

      const selectedWeakCoreCount = nodeList.length;
      const denominator = Math.max(1, coreCandidates.length);
      corePickedPercentileActualByNode.set(nodeSlug, Number((selectedWeakCoreCount / denominator).toFixed(6)));
      coreMinScoreUsedByNode.set(nodeSlug, Number(minScoreUsedForPicks.toFixed(6)));
    }

    const summaries: NodeSummary[] = [];
    let totalRequested = 0;
    let totalAssigned = 0;

    for (const node of spec.nodes) {
      const nodeInfo = nodeBySlug.get(node.slug);
      if (!nodeInfo) {
        continue;
      }

      const curated = curatedByNode.get(node.slug) ?? [];
      const coreWeak = (nodeSelectedWeak.get(node.slug) ?? [])
        .sort((a, b) => (b.finalScore - a.finalScore)
          || (b.journeyScore - a.journeyScore)
          || (b.movie.popularity - a.movie.popularity)
          || (a.movie.tmdbId - b.movie.tmdbId));
      const coreMovieIds = new Set(coreWeak.map((entry) => entry.movie.id));
      const extendedOnly = (nodeExtendedPool.get(node.slug) ?? [])
        .filter((entry) => !coreMovieIds.has(entry.movie.id))
        .sort((a, b) => (b.finalScore - a.finalScore)
          || (b.journeyScore - a.journeyScore)
          || (b.movie.popularity - a.movie.popularity)
          || (a.movie.tmdbId - b.movie.tmdbId));

      const assignments: NodeAssignmentData[] = [];
      let coreRank = 1;

      for (const entry of curated) {
        assignments.push({ ...entry, rank: coreRank, coreRank, tier: 'CORE' });
        coreRank += 1;
      }

      for (const entry of coreWeak) {
        assignments.push({
          nodeId: nodeInfo.id,
          movieId: entry.movie.id,
          rank: coreRank,
          tier: 'CORE',
          coreRank,
          source: 'weak_supervision',
          score: Number(entry.finalScore.toFixed(4)),
          finalScore: Number(entry.finalScore.toFixed(6)),
          journeyScore: Number(entry.journeyScore.toFixed(6)),
          evidence: {
            qualityFloor: entry.qualityFloor,
            coreThreshold: entry.coreThreshold,
            rawProbability: Number(entry.rawProbability.toFixed(4)),
            classifierProbability: entry.classifierProbability === null ? null : Number(entry.classifierProbability.toFixed(4)),
            assistProbability: Number(entry.assistProbability.toFixed(4)),
            assistWeight: classifierArtifact ? classifierAssistWeight : 0,
            adjustedProbability: Number(entry.finalScore.toFixed(4)),
            journeyScore: Number(entry.journeyScore.toFixed(4)),
            penalties: entry.penalties,
            firedLfNames: entry.firedLfNames,
            evidence: entry.evidenceSummary,
            positiveWeight: entry.positiveWeight,
            negativeWeight: entry.negativeWeight,
          },
          runId,
          taxonomyVersion: config.taxonomyVersion,
        });
        coreRank += 1;
      }

      let extendedRank = coreRank;
      for (const entry of extendedOnly) {
        assignments.push({
          nodeId: nodeInfo.id,
          movieId: entry.movie.id,
          rank: extendedRank,
          tier: 'EXTENDED',
          coreRank: null,
          source: 'weak_supervision',
          score: Number(entry.finalScore.toFixed(4)),
          finalScore: Number(entry.finalScore.toFixed(6)),
          journeyScore: Number(entry.journeyScore.toFixed(6)),
          evidence: {
            qualityFloor: entry.qualityFloor,
            coreThreshold: entry.coreThreshold,
            rawProbability: Number(entry.rawProbability.toFixed(4)),
            classifierProbability: entry.classifierProbability === null ? null : Number(entry.classifierProbability.toFixed(4)),
            assistProbability: Number(entry.assistProbability.toFixed(4)),
            assistWeight: classifierArtifact ? classifierAssistWeight : 0,
            adjustedProbability: Number(entry.finalScore.toFixed(4)),
            journeyScore: Number(entry.journeyScore.toFixed(4)),
            penalties: entry.penalties,
            firedLfNames: entry.firedLfNames,
            evidence: entry.evidenceSummary,
            positiveWeight: entry.positiveWeight,
            negativeWeight: entry.negativeWeight,
          },
          runId,
          taxonomyVersion: config.taxonomyVersion,
        });
        extendedRank += 1;
      }

      await prisma.nodeMovie.deleteMany({ where: { nodeId: nodeInfo.id } });
      if (assignments.length > 0) {
        await prisma.nodeMovie.createMany({ data: assignments, skipDuplicates: true });
      }

      const requestedTitles = mergeRequestedTitles(
        node.titles.slice(0, limitPerNode),
        getSeason1MustIncludeForNode(node.slug).map((entry) => ({
          title: entry.title,
          year: entry.year,
          ...(entry.altTitle ? { altTitle: entry.altTitle } : {}),
        })),
      );
      totalRequested += requestedTitles.length;
      totalAssigned += assignments.length;

      summaries.push({
        slug: node.slug,
        requested: requestedTitles.length,
        curatedAssigned: curated.length,
        weakCoreAssigned: coreWeak.length,
        weakExtendedAssigned: extendedOnly.length,
        assigned: assignments.length,
        coreCount: curated.length + coreWeak.length,
        extendedCount: extendedOnly.length,
        targetSize: resolvePerNodeTargetSize(config, node.slug),
        minEligible: resolvePerNodeMinEligible(config, node.slug),
        qualityFloor: resolvePerNodeQualityFloor(config, node.slug),
        coreThreshold: resolvePerNodeCoreThreshold(config, node.slug),
        coreMinScoreUsed: coreMinScoreUsedByNode.get(node.slug) ?? resolvePerNodeCoreMinScoreAbsolute(config, node.slug),
        pickedPercentileActual: corePickedPercentileActualByNode.get(node.slug) ?? 0,
        eligibleWeak: nodeExtendedPool.get(node.slug)?.length ?? 0,
        excludedOnlyByOverlapForCore: coreOverlapExcludedByNode.get(node.slug) ?? 0,
        unresolved: unresolved.filter((row) => row.nodeSlug === node.slug).length,
        belowMinFloor: (curated.length + coreWeak.length) < resolvePerNodeMinEligible(config, node.slug),
      });
    }

    await backfillCoreMovieMetadataForPack(prisma, pack.id);

    const release = await createSeasonNodeReleaseFromNodeMovie(prisma, {
      seasonId: season.id,
      packId: pack.id,
      taxonomyVersion: config.taxonomyVersion,
      runId,
      publish: publishSnapshot,
      metadata: {
        source: 'seed-season1-horror-subgenres',
        nodeCount: summaries.length,
        maxNodesPerMovie,
        defaultMaxExtendedPerNode: config.defaults.maxExtendedPerNode ?? null,
        defaultCoreMinScoreAbsolute: config.defaults.coreMinScoreAbsolute,
        defaultCorePickPercentile: config.defaults.corePickPercentile,
        defaultCoreMaxPerNode: config.defaults.coreMaxPerNode,
        journeyMinCore,
        journeyMinExtended,
        publishSnapshot,
      },
    });

    const runRows = await prisma.nodeMovie.findMany({
      where: {
        runId,
        taxonomyVersion: config.taxonomyVersion,
        node: { packId: pack.id },
      },
      select: {
        movieId: true,
        tier: true,
      },
    });
    const coreRows = runRows.filter((row) => row.tier === 'CORE');
    const extendedRows = runRows.filter((row) => row.tier === 'EXTENDED');
    const coreMovieIds = new Set(coreRows.map((row) => row.movieId));
    const extendedMovieIds = new Set(extendedRows.map((row) => row.movieId));
    const totalUniqueMovieIds = new Set(runRows.map((row) => row.movieId));
    let extendedUniqueOnly = 0;
    for (const movieId of extendedMovieIds) {
      if (!coreMovieIds.has(movieId)) {
        extendedUniqueOnly += 1;
      }
    }

    const lines: string[] = [];
    lines.push('# Season 1 Horror Required Subgenre Readiness');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Run ID: ${runId}`);
    lines.push(`Taxonomy version: ${config.taxonomyVersion}`);
    lines.push(`Max nodes per movie: ${maxNodesPerMovie}`);
    lines.push(`Classifier assist: ${classifierArtifact ? `enabled weight=${classifierAssistWeight} artifact=${classifierPath}` : 'disabled'}`);
    lines.push(`Snapshot release: ${release.releaseId}${publishSnapshot ? ' (published)' : ' (draft)'}`);
    lines.push('');
    lines.push(`Requested curated titles: ${totalRequested}`);
    lines.push(`Assigned titles: ${totalAssigned}`);
    lines.push(`Unresolved curated titles: ${unresolved.length}`);
    lines.push('');
    lines.push('## Per-node');
    lines.push('');
    lines.push('| Node | Requested | Curated Core | Weak Core | Extended | Assigned | Target Core | Min Core | Quality Floor | Core Threshold | Core Min Used | Picked % | Eligible Extended | Overlap Excl. | Below min | Unresolved |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | ---: |');
    summaries.forEach((summary) => {
      lines.push(
        `| ${summary.slug} | ${summary.requested} | ${summary.curatedAssigned} | ${summary.weakCoreAssigned} | ${summary.extendedCount} | ${summary.assigned} | ${summary.targetSize} | ${summary.minEligible} | ${summary.qualityFloor.toFixed(2)} | ${summary.coreThreshold.toFixed(2)} | ${summary.coreMinScoreUsed.toFixed(2)} | ${(summary.pickedPercentileActual * 100).toFixed(1)}% | ${summary.eligibleWeak} | ${summary.excludedOnlyByOverlapForCore} | ${summary.belowMinFloor ? 'YES' : 'NO'} | ${summary.unresolved} |`,
      );
    });
    lines.push('');
    lines.push('## Unresolved curated titles');
    lines.push('');
    if (unresolved.length === 0) {
      lines.push('- None');
    } else {
      unresolved.forEach((item) => {
        lines.push(`- ${item.nodeSlug}: ${item.title} (${item.year}) - ${item.reason}`);
      });
    }

    await writeFile(READINESS_PATH, `${lines.join('\n')}\n`, 'utf8');

    if (buildDebugExclusions) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputDir = resolve(debugOutputRoot, stamp);
      await mkdir(outputDir, { recursive: true });
      const payload = {
        generatedAt: new Date().toISOString(),
        runId,
        taxonomyVersion: config.taxonomyVersion,
        journeyMinCore,
        journeyMinExtended,
        reasons: exclusionCollector.toJson(),
      };
      const outPath = resolve(outputDir, 'exclusion-reasons.json');
      await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      console.log(`Build debug exclusions written: ${outPath}`);
    }

    console.log(
      `Season 1 weak-supervision seed complete: taxonomyVersion=${config.taxonomyVersion} nodes=${summaries.length} requested=${totalRequested} assigned=${totalAssigned} unresolved=${unresolved.length} runId=${runId}`,
    );
    console.log(
      `Assignment summary: coreAssignments=${coreRows.length} extendedAssignments=${extendedRows.length} totalAssignments=${runRows.length} coreUnique=${coreMovieIds.size} extendedUniqueOnly=${extendedUniqueOnly} totalUnique=${totalUniqueMovieIds.size}`,
    );
    console.log(
      `Snapshot release created: ${release.releaseId} coreItems=${release.itemCount} published=${publishSnapshot}`,
    );
    console.log(`Readiness report updated: ${READINESS_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 weak-supervision seed failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
