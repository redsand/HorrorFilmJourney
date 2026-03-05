import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SEASON3_SCI_FI_NODE_KEYWORDS } from '../src/lib/seasons/season3/taxonomy.ts';

type GovernanceFile = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
  nodes: Record<string, unknown>;
};

type Candidate = {
  tmdbId: number;
  title: string;
  year: number | null;
  overview?: string | null;
  discoveryReasons?: string[];
  discoveryScore?: number;
  topNodes?: Array<{ nodeSlug?: string; probability?: number }>;
};

type CandidateFile = {
  candidates?: Candidate[];
};

type TmdbDetails = {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  genres?: Array<{ name?: string }>;
  production_countries?: Array<{ name?: string }>;
  credits?: {
    crew?: Array<{ job?: string; name?: string }>;
    cast?: Array<{ name?: string; character?: string }>;
  };
  vote_average?: number;
};

const GOVERNANCE_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-node-governance.json');
const DEFAULT_CANDIDATE_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-candidates-calibrated.json');
const MASTERED_OUTPUT = path.resolve('docs', 'season', 'season-3-sci-fi-mastered.json');

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickYear(releaseDate?: string, fallback?: number | null): number | null {
  if (releaseDate && releaseDate.length >= 4) {
    const year = Number.parseInt(releaseDate.slice(0, 4), 10);
    if (Number.isInteger(year)) return year;
  }
  return fallback ?? null;
}

function nodeMatchScore(nodeSlug: string, candidate: Candidate): number {
  const terms = SEASON3_SCI_FI_NODE_KEYWORDS[nodeSlug] ?? [];
  if (terms.length === 0) return 0;
  const haystack = normalize([
    candidate.title,
    candidate.overview ?? '',
    ...(candidate.discoveryReasons ?? []),
  ].join(' '));
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(normalize(term))) {
      score += 1;
    }
  }
  return score;
}

function classifierNodeScore(nodeSlug: string, candidate: Candidate): number {
  const topNodes = Array.isArray(candidate.topNodes) ? candidate.topNodes : [];
  for (const topNode of topNodes) {
    if (topNode?.nodeSlug === nodeSlug && typeof topNode.probability === 'number') {
      return Math.max(0, topNode.probability);
    }
  }
  return 0;
}

async function fetchTmdbDetails(apiKey: string, tmdbId: number): Promise<TmdbDetails | null> {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('append_to_response', 'credits');
  url.searchParams.set('language', 'en-US');
  const response = await fetch(url.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    return null;
  }
  return response.json() as Promise<TmdbDetails>;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const apiKey = process.env.TMDB_API_KEY?.trim();
  const nodeSize = parseIntEnv('SEASON3_NODE_SIZE', 40);
  const runId = process.env.SEASON3_ASSIGNMENT_RUN_ID?.trim() || `season3-seed-${new Date().toISOString()}`;
  const publish = process.argv.includes('--apply');
  const inputArg = process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length).trim();
  const candidatePath = path.resolve(inputArg || DEFAULT_CANDIDATE_PATH);

  try {
    const governance = JSON.parse(await fs.readFile(GOVERNANCE_PATH, 'utf8')) as GovernanceFile;
    const candidateFile = JSON.parse(await fs.readFile(candidatePath, 'utf8')) as CandidateFile;
    const candidates = (candidateFile.candidates ?? [])
      .filter((item) => Number.isInteger(item.tmdbId) && item.title?.trim())
      .sort((a, b) => (b.discoveryScore ?? 0) - (a.discoveryScore ?? 0));

    if (candidates.length === 0) {
      throw new Error('No Season 3 sci-fi candidates found.');
    }

    const season = await prisma.season.findUnique({
      where: { slug: governance.seasonSlug },
      select: { id: true, slug: true },
    });
    if (!season) {
      throw new Error(`Missing season ${governance.seasonSlug}. Run seasons:create-template --provision-db first.`);
    }
    const pack = await prisma.genrePack.findUnique({
      where: { slug: governance.packSlug },
      select: { id: true, slug: true, seasonId: true },
    });
    if (!pack || pack.seasonId !== season.id) {
      throw new Error(`Missing or unlinked pack ${governance.packSlug}.`);
    }

    const nodeSlugs = Object.keys(governance.nodes);
    if (nodeSlugs.length === 0) {
      throw new Error('No nodes found in season-3 governance config.');
    }

    const nodes = [];
    for (let i = 0; i < nodeSlugs.length; i += 1) {
      const slug = nodeSlugs[i]!;
      // eslint-disable-next-line no-await-in-loop
      const node = await prisma.journeyNode.upsert({
        where: { packId_slug: { packId: pack.id, slug } },
        update: {
          name: titleCaseFromSlug(slug),
          taxonomyVersion: governance.taxonomyVersion,
          orderIndex: i + 1,
        },
        create: {
          packId: pack.id,
          slug,
          name: titleCaseFromSlug(slug),
          taxonomyVersion: governance.taxonomyVersion,
          learningObjective: `Season 3 Sci-Fi node: ${titleCaseFromSlug(slug)}.`,
          whatToNotice: Prisma.JsonNull,
          eraSubgenreFocus: 'Season 3 Sci-Fi',
          spoilerPolicyDefault: 'light',
          orderIndex: i + 1,
        },
        select: { id: true, slug: true, orderIndex: true },
      });
      nodes.push(node);
    }

    const sortedNodes = nodes.sort((a, b) => a.orderIndex - b.orderIndex);
    const usedTmdb = new Set<number>();
    const assignments: Array<{ nodeId: string; nodeSlug: string; tmdbId: number; rank: number; coreRank: number }> = [];
    const perNodeCount = new Map(sortedNodes.map((node) => [node.id, 0]));

    const pickBestForNode = (nodeSlug: string, requirePositiveSignal: boolean): Candidate | null => {
      let best: { candidate: Candidate; score: number; base: number } | null = null;
      for (const candidate of candidates) {
        if (usedTmdb.has(candidate.tmdbId)) continue;
        const keywordScore = nodeMatchScore(nodeSlug, candidate);
        const classifierScore = classifierNodeScore(nodeSlug, candidate);
        const combined = (keywordScore * 2) + (classifierScore * 8);
        if (requirePositiveSignal && combined <= 0) continue;
        const base = candidate.discoveryScore ?? 0;
        if (!best || combined > best.score || (combined === best.score && base > best.base)) {
          best = { candidate, score: combined, base };
        }
      }
      return best?.candidate ?? null;
    };

    const roundRobinAssign = (requirePositiveSignal: boolean): boolean => {
      let assignedAny = false;
      for (const node of sortedNodes) {
        const count = perNodeCount.get(node.id) ?? 0;
        if (count >= nodeSize) continue;
        const picked = pickBestForNode(node.slug, requirePositiveSignal);
        if (!picked) continue;
        usedTmdb.add(picked.tmdbId);
        const nextRank = count + 1;
        perNodeCount.set(node.id, nextRank);
        assignments.push({
          nodeId: node.id,
          nodeSlug: node.slug,
          tmdbId: picked.tmdbId,
          rank: nextRank,
          coreRank: nextRank,
        });
        assignedAny = true;
      }
      return assignedAny;
    };

    // Pass 1: assign only candidates with explicit signal for each node.
    while (roundRobinAssign(true)) {
      // continue until no node can be filled with a positive signal candidate.
    }
    // Pass 2: soft backfill remaining slots if candidates remain.
    while (roundRobinAssign(false)) {
      // continue until no further candidates remain or all nodes hit nodeSize.
    }

    if (assignments.length === 0) {
      throw new Error('No assignments could be produced for Season 3.');
    }

    const detailsCache = new Map<number, TmdbDetails | null>();
    for (const assignment of assignments) {
      if (detailsCache.has(assignment.tmdbId)) continue;
      if (!apiKey) {
        detailsCache.set(assignment.tmdbId, null);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const details = await fetchTmdbDetails(apiKey, assignment.tmdbId);
      detailsCache.set(assignment.tmdbId, details);
    }

    await prisma.$transaction(async (tx) => {
      await tx.nodeMovie.deleteMany({
        where: {
          node: { packId: pack.id },
          taxonomyVersion: governance.taxonomyVersion,
        },
      });

      for (const assignment of assignments) {
        const details = detailsCache.get(assignment.tmdbId);
        const fallback = candidates.find((candidate) => candidate.tmdbId === assignment.tmdbId)!;
        const title = details?.title?.trim() || fallback.title;
        const year = pickYear(details?.release_date, fallback.year);
        const posterPath = details?.poster_path?.trim();
        const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : 'https://image.tmdb.org/t/p/w500';
        const genres = (details?.genres ?? [])
          .map((genre) => genre.name?.trim().toLowerCase() ?? '')
          .filter(Boolean);
        const director = details?.credits?.crew?.find((crew) => crew.job === 'Director')?.name?.trim() ?? null;
        const castTop = (details?.credits?.cast ?? [])
          .slice(0, 6)
          .map((cast) => ({ name: cast.name?.trim() ?? '', role: cast.character?.trim() ?? undefined }))
          .filter((cast) => cast.name.length > 0);
        const country = (details?.production_countries ?? [])
          .map((countryItem) => countryItem.name?.trim() ?? '')
          .find(Boolean) ?? null;

        const movie = await tx.movie.upsert({
          where: { tmdbId: assignment.tmdbId },
          create: {
            tmdbId: assignment.tmdbId,
            title,
            year,
            synopsis: details?.overview?.trim() || fallback.overview || null,
            posterUrl,
            genres,
            keywords: fallback.discoveryReasons ?? [],
            country,
            director,
            castTop,
          },
          update: {
            title,
            year,
            synopsis: details?.overview?.trim() || fallback.overview || null,
            posterUrl,
            genres,
            keywords: fallback.discoveryReasons ?? [],
            country,
            director,
            castTop,
          },
          select: { id: true },
        });

        if (typeof details?.vote_average === 'number') {
          await tx.movieRating.upsert({
            where: { movieId_source: { movieId: movie.id, source: 'TMDB' } },
            create: {
              movieId: movie.id,
              source: 'TMDB',
              value: details.vote_average,
              scale: '10',
              rawValue: `${details.vote_average}/10`,
            },
            update: {
              value: details.vote_average,
              scale: '10',
              rawValue: `${details.vote_average}/10`,
            },
          });
        }

        await tx.nodeMovie.create({
          data: {
            nodeId: assignment.nodeId,
            movieId: movie.id,
            rank: assignment.rank,
            coreRank: assignment.coreRank,
            tier: 'CORE',
            source: 'season3-sci-fi-seed',
            score: 1,
            finalScore: 1,
            journeyScore: 1,
            runId,
            taxonomyVersion: governance.taxonomyVersion,
            evidence: Prisma.JsonNull,
          },
        });
      }
    });

    const release = await prisma.$transaction(async (tx) => {
      if (publish) {
        await tx.seasonNodeRelease.updateMany({
          where: { seasonId: season.id, packId: pack.id, isPublished: true },
          data: { isPublished: false, publishedAt: null },
        });
      }
      const created = await tx.seasonNodeRelease.create({
        data: {
          seasonId: season.id,
          packId: pack.id,
          taxonomyVersion: governance.taxonomyVersion,
          runId,
          isPublished: publish,
          publishedAt: publish ? new Date() : null,
          metadata: {
            source: 'seed-season3-sci-fi-curriculum',
            assignmentCount: assignments.length,
          },
        },
        select: { id: true },
      });

      const nodeMovies = await tx.nodeMovie.findMany({
        where: {
          node: { packId: pack.id },
          taxonomyVersion: governance.taxonomyVersion,
          tier: 'CORE',
        },
        include: {
          node: { select: { slug: true, orderIndex: true } },
          movie: { select: { id: true, tmdbId: true, title: true, year: true } },
        },
        orderBy: [{ node: { orderIndex: 'asc' } }, { coreRank: 'asc' }, { rank: 'asc' }],
      });

      if (nodeMovies.length > 0) {
        await tx.seasonNodeReleaseItem.createMany({
          data: nodeMovies.map((item) => ({
            releaseId: created.id,
            nodeSlug: item.node.slug,
            movieId: item.movieId,
            rank: item.rank,
            source: item.source,
            score: item.score,
            evidence: item.evidence === null ? Prisma.JsonNull : item.evidence as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
      }
      return { id: created.id, items: nodeMovies };
    });

    const nodeMap = new Map<string, { core: Array<{ title: string; year: number | null; tmdbId: number }> }>();
    for (const item of release.items) {
      const bucket = nodeMap.get(item.node.slug) ?? { core: [] };
      bucket.core.push({
        title: item.movie.title,
        year: item.movie.year,
        tmdbId: item.movie.tmdbId,
      });
      nodeMap.set(item.node.slug, bucket);
    }
    const mastered = {
      season: 'sci-fi',
      taxonomyVersion: governance.taxonomyVersion,
      summary: {
        coreCount: release.items.length,
        extendedCount: 0,
        totalUnique: release.items.length,
      },
      nodes: nodes
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((node) => ({
          slug: node.slug,
          core: nodeMap.get(node.slug)?.core ?? [],
          extended: [],
        })),
      status: publish ? 'final' : 'draft',
      finalizedAt: publish ? new Date().toISOString() : null,
    };
    await fs.writeFile(MASTERED_OUTPUT, `${JSON.stringify(mastered, null, 2)}\n`, 'utf8');

    console.log(`[seed-season3-sci-fi] nodes=${nodes.length} nodeSize=${nodeSize} assignments=${assignments.length}`);
    console.log(`[seed-season3-sci-fi] release=${release.id} publish=${publish}`);
    console.log(`[seed-season3-sci-fi] input=${candidatePath}`);
    console.log(`[seed-season3-sci-fi] wrote ${MASTERED_OUTPUT}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[seed-season3-sci-fi] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
