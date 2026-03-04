import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  buildSeason1LabelingFunctions,
  inferNodeProbabilities,
  type LabelingFunction,
} from '../src/lib/nodes/weak-supervision/index.ts';
import { evaluateCurriculumEligibility } from '../src/lib/curriculum/eligibility.ts';
import {
  applySeason1GovernanceEnvOverrides,
  loadSeason1NodeGovernanceConfig,
  resolvePerNodeMinEligible,
  resolvePerNodeTargetSize,
  resolvePerNodeThreshold,
  toPairKey,
} from '../src/lib/nodes/governance/season1-governance.ts';
import { createSeasonNodeReleaseFromNodeMovie } from '../src/lib/nodes/governance/release-artifact.ts';

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
  genres: string[];
  popularity: number;
  eligible: boolean;
};

type NodeAssignmentData = {
  nodeId: string;
  movieId: string;
  rank: number;
  source: 'curated' | 'weak_supervision';
  score: number | null;
  evidence: Record<string, unknown>;
  runId: string;
  taxonomyVersion: string;
};

type WeakCandidate = {
  nodeSlug: string;
  nodeId: string;
  movie: CatalogMovie;
  rawProbability: number;
  adjustedProbability: number;
  threshold: number;
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
  weakAssigned: number;
  assigned: number;
  targetSize: number;
  minEligible: number;
  threshold: number;
  eligibleWeak: number;
  belowMinFloor: boolean;
  unresolved: number;
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

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === '1' || raw === 'true' || raw === 'yes';
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

function evidenceSummaryFromFired(fired: Array<{ lfName: string; evidence: string[] }>): string[] {
  return fired
    .slice(0, 4)
    .map((entry) => {
      const parts = entry.evidence.slice(0, 2).join(',');
      return parts.length > 0 ? `${entry.lfName} (${parts})` : entry.lfName;
    });
}

async function loadSpec(): Promise<CurriculumSpec> {
  const raw = await readFile(SPEC_PATH, 'utf8');
  return JSON.parse(raw) as CurriculumSpec;
}

function isPairMatch(a: string, b: string, left: string, right: string): boolean {
  return toPairKey(a, b) === toPairKey(left, right);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const limitPerNode = parseIntEnv('SEASON1_REQUIRED_LIMIT_PER_NODE', 20);
  const runId = process.env.SEASON1_ASSIGNMENT_RUN_ID?.trim() || `season1-weak-supervision-${new Date().toISOString()}`;
  const publishSnapshot = parseBooleanEnv('SEASON1_PUBLISH_SNAPSHOT', false);

  try {
    const spec = await loadSpec();
    const configRaw = await loadSeason1NodeGovernanceConfig();
    const config = applySeason1GovernanceEnvOverrides(configRaw, spec.nodes.map((n) => n.slug));

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
        genres: true,
        posterUrl: true,
        director: true,
        castTop: true,
        ratings: { select: { source: true, value: true } },
      },
    });

    const allMovies: CatalogMovie[] = allMoviesRaw.map((movie) => {
      const genres = parseJsonStringArray(movie.genres);
      const eligibility = evaluateCurriculumEligibility({
        posterUrl: movie.posterUrl ?? '',
        director: movie.director,
        castTop: movie.castTop,
        ratings: movie.ratings.map((rating) => ({ source: rating.source })),
        hasStreamingData: false,
      });
      const popularity = movie.ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? 0;
      return {
        id: movie.id,
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year,
        genres,
        popularity,
        eligible: eligibility.isEligible,
      };
    });

    const eligibleHorrorPool = allMovies.filter((movie) => movie.eligible && movie.genres.includes('horror'));
    const movieByLookup = new Map(allMovies.map((movie) => [makeLookupKey(movie.title, movie.year), movie] as const));

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

      const requestedTitles = node.titles.slice(0, limitPerNode);
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

        curatedMovieIds.add(found.id);
        curatedAssignments.push({
          nodeId: upsertedNode.id,
          movieId: found.id,
          rank: 0,
          source: 'curated',
          score: 1,
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

      const threshold = resolvePerNodeThreshold(config, node.slug);
      const weakCandidates = eligibleHorrorPool
        .filter((movie) => !curatedMovieIds.has(movie.id))
        .map((movie) => {
          const nodeProbability = inferNodeProbabilities(movie, [node.slug], lfs)[0]!;
          return {
            movie,
            rawProbability: nodeProbability.probability,
            threshold,
            firedLfNames: nodeProbability.fired.slice(0, 8).map((f) => f.lfName),
            evidenceSummary: evidenceSummaryFromFired(nodeProbability.fired),
            positiveWeight: Number(nodeProbability.positiveWeight.toFixed(4)),
            negativeWeight: Number(nodeProbability.negativeWeight.toFixed(4)),
          };
        })
        .filter((entry) => entry.rawProbability >= threshold)
        .sort((a, b) => (b.rawProbability - a.rawProbability) || (b.movie.popularity - a.movie.popularity) || (a.movie.tmdbId - b.movie.tmdbId))
        .map((entry) => ({
          nodeSlug: node.slug,
          nodeId: upsertedNode.id,
          movie: entry.movie,
          rawProbability: Number(entry.rawProbability.toFixed(6)),
          adjustedProbability: Number(entry.rawProbability.toFixed(6)),
          threshold: entry.threshold,
          firedLfNames: entry.firedLfNames,
          evidenceSummary: entry.evidenceSummary,
          positiveWeight: entry.positiveWeight,
          negativeWeight: entry.negativeWeight,
          penalties: [],
        }));

      weakCandidatesByNode.set(node.slug, weakCandidates);
    }

    const disallowed = config.overlapConstraints.disallowedPairs;
    const penalized = config.overlapConstraints.penalizedPairs;
    const maxNodesPerMovie = config.defaults.maxNodesPerMovie;

    const workingAssignmentsByMovie = new Map<string, Set<string>>();
    for (const [movieId, fixed] of fixedAssignmentsByMovie.entries()) {
      workingAssignmentsByMovie.set(movieId, new Set(fixed));
    }

    const nodeSelectedWeak = new Map<string, WeakCandidate[]>();
    const nodeWeakCount = new Map<string, number>(specNodeSlugs.map((slug) => [slug, 0] as const));
    const flattened = [...weakCandidatesByNode.values()].flat();

    flattened.sort((a, b) => (b.rawProbability - a.rawProbability)
      || (b.movie.popularity - a.movie.popularity)
      || a.nodeSlug.localeCompare(b.nodeSlug)
      || (a.movie.tmdbId - b.movie.tmdbId));

    for (const candidate of flattened) {
      const target = resolvePerNodeTargetSize(config, candidate.nodeSlug);
      const curatedCount = curatedByNode.get(candidate.nodeSlug)?.length ?? 0;
      const weakCap = Math.max(0, target - curatedCount);
      const currentWeak = nodeWeakCount.get(candidate.nodeSlug) ?? 0;
      if (currentWeak >= weakCap) {
        continue;
      }

      const movieSet = workingAssignmentsByMovie.get(candidate.movie.id) ?? new Set<string>();
      if (movieSet.has(candidate.nodeSlug)) {
        continue;
      }
      if (movieSet.size >= maxNodesPerMovie) {
        continue;
      }

      const disallowedConflict = [...movieSet].some((existingSlug) =>
        disallowed.some(([a, b]) => isPairMatch(a, b, existingSlug, candidate.nodeSlug)));
      if (disallowedConflict) {
        continue;
      }

      const penalties = [...movieSet]
        .flatMap((existingSlug) =>
          penalized
            .filter((rule) => isPairMatch(rule.a, rule.b, existingSlug, candidate.nodeSlug))
            .map((rule) => ({ pairWith: existingSlug, amount: rule.penalty, reason: rule.reason })),
        );

      const totalPenalty = penalties.reduce((sum, item) => sum + item.amount, 0);
      const adjusted = Math.max(0, candidate.rawProbability - totalPenalty);
      if (adjusted < candidate.threshold) {
        continue;
      }

      const accepted: WeakCandidate = {
        ...candidate,
        penalties,
        adjustedProbability: Number(adjusted.toFixed(6)),
      };

      const nodeList = nodeSelectedWeak.get(candidate.nodeSlug) ?? [];
      nodeList.push(accepted);
      nodeSelectedWeak.set(candidate.nodeSlug, nodeList);
      nodeWeakCount.set(candidate.nodeSlug, currentWeak + 1);
      movieSet.add(candidate.nodeSlug);
      workingAssignmentsByMovie.set(candidate.movie.id, movieSet);
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
      const weak = (nodeSelectedWeak.get(node.slug) ?? [])
        .sort((a, b) => (b.adjustedProbability - a.adjustedProbability)
          || (b.rawProbability - a.rawProbability)
          || (b.movie.popularity - a.movie.popularity)
          || (a.movie.tmdbId - b.movie.tmdbId));

      const assignments: NodeAssignmentData[] = [];
      let rank = 1;

      for (const entry of curated) {
        assignments.push({ ...entry, rank });
        rank += 1;
      }

      for (const entry of weak) {
        assignments.push({
          nodeId: nodeInfo.id,
          movieId: entry.movie.id,
          rank,
          source: 'weak_supervision',
          score: Number(entry.adjustedProbability.toFixed(4)),
          evidence: {
            threshold: entry.threshold,
            rawProbability: Number(entry.rawProbability.toFixed(4)),
            adjustedProbability: Number(entry.adjustedProbability.toFixed(4)),
            penalties: entry.penalties,
            firedLfNames: entry.firedLfNames,
            evidence: entry.evidenceSummary,
            positiveWeight: entry.positiveWeight,
            negativeWeight: entry.negativeWeight,
          },
          runId,
          taxonomyVersion: config.taxonomyVersion,
        });
        rank += 1;
      }

      await prisma.nodeMovie.deleteMany({ where: { nodeId: nodeInfo.id } });
      if (assignments.length > 0) {
        await prisma.nodeMovie.createMany({ data: assignments, skipDuplicates: true });
      }

      const requestedTitles = node.titles.slice(0, limitPerNode);
      totalRequested += requestedTitles.length;
      totalAssigned += assignments.length;

      summaries.push({
        slug: node.slug,
        requested: requestedTitles.length,
        curatedAssigned: curated.length,
        weakAssigned: weak.length,
        assigned: assignments.length,
        targetSize: resolvePerNodeTargetSize(config, node.slug),
        minEligible: resolvePerNodeMinEligible(config, node.slug),
        threshold: resolvePerNodeThreshold(config, node.slug),
        eligibleWeak: weakCandidatesByNode.get(node.slug)?.length ?? 0,
        unresolved: Math.max(0, requestedTitles.length - curated.length),
        belowMinFloor: assignments.length < resolvePerNodeMinEligible(config, node.slug),
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
        publishSnapshot,
      },
    });

    const lines: string[] = [];
    lines.push('# Season 1 Horror Required Subgenre Readiness');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Run ID: ${runId}`);
    lines.push(`Taxonomy version: ${config.taxonomyVersion}`);
    lines.push(`Max nodes per movie: ${maxNodesPerMovie}`);
    lines.push(`Snapshot release: ${release.releaseId}${publishSnapshot ? ' (published)' : ' (draft)'}`);
    lines.push('');
    lines.push(`Requested curated titles: ${totalRequested}`);
    lines.push(`Assigned titles: ${totalAssigned}`);
    lines.push(`Unresolved curated titles: ${unresolved.length}`);
    lines.push('');
    lines.push('## Per-node');
    lines.push('');
    lines.push('| Node | Requested | Curated | Weak | Assigned | Target | Min | Threshold | Eligible weak | Below min | Unresolved |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | ---: |');
    summaries.forEach((summary) => {
      lines.push(
        `| ${summary.slug} | ${summary.requested} | ${summary.curatedAssigned} | ${summary.weakAssigned} | ${summary.assigned} | ${summary.targetSize} | ${summary.minEligible} | ${summary.threshold.toFixed(2)} | ${summary.eligibleWeak} | ${summary.belowMinFloor ? 'YES' : 'NO'} | ${summary.unresolved} |`,
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

    console.log(
      `Season 1 weak-supervision seed complete: taxonomyVersion=${config.taxonomyVersion} nodes=${summaries.length} requested=${totalRequested} assigned=${totalAssigned} unresolved=${unresolved.length} runId=${runId}`,
    );
    console.log(`Snapshot release created: ${release.releaseId} items=${release.itemCount} published=${publishSnapshot}`);
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
