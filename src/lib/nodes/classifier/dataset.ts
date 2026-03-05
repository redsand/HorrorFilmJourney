import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { BuiltDataset, ClassifierMovieInput, DatasetRow } from './types';
import { parseCastNames, parseJsonStringArray } from './features';

type BuildDatasetInput = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion?: string;
  validationRatio: number;
  splitSeed: number;
  genreHints?: string[];
};

function stableRatio(key: string, seed: number): number {
  const hash = createHash('sha256').update(`${seed}:${key}`).digest('hex').slice(0, 8);
  const value = Number.parseInt(hash, 16);
  return value / 0xffffffff;
}

export async function buildSeasonTrainingDataset(
  prisma: PrismaClient,
  input: BuildDatasetInput,
): Promise<BuiltDataset> {
  const season = await prisma.season.findUnique({
    where: { slug: input.seasonSlug },
    select: {
      id: true,
      packs: {
        where: { slug: input.packSlug },
        select: { id: true },
      },
    },
  });

  if (!season || season.packs.length === 0) {
    throw new Error(`Pack ${input.packSlug} not found in season ${input.seasonSlug}`);
  }
  const packId = season.packs[0]!.id;

  const release = await prisma.seasonNodeRelease.findFirst({
    where: {
      seasonId: season.id,
      packId,
      isPublished: true,
      ...(input.taxonomyVersion ? { taxonomyVersion: input.taxonomyVersion } : {}),
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      taxonomyVersion: true,
      items: {
        select: {
          movieId: true,
          nodeSlug: true,
          source: true,
        },
      },
    },
  });

  if (!release) {
    throw new Error(`No published release found for ${input.seasonSlug}/${input.packSlug} training labels`);
  }

  const nodeSlugs = await prisma.journeyNode.findMany({
    where: {
      packId,
      taxonomyVersion: release.taxonomyVersion,
    },
    orderBy: { orderIndex: 'asc' },
    select: { slug: true },
  }).then((rows) => rows.map((row) => row.slug));

  if (nodeSlugs.length < 4) {
    throw new Error(`Expected at least 4 nodes for training; found ${nodeSlugs.length}`);
  }

  const positiveByMovie = new Map<string, Set<string>>();
  for (const item of release.items) {
    const set = positiveByMovie.get(item.movieId) ?? new Set<string>();
    set.add(item.nodeSlug);
    positiveByMovie.set(item.movieId, set);
  }

  const adminOverrides = await prisma.nodeMovie.findMany({
    where: {
      source: 'override',
      node: {
        packId,
      },
    },
    select: {
      movieId: true,
      node: { select: { slug: true } },
    },
  });
  for (const row of adminOverrides) {
    const set = positiveByMovie.get(row.movieId) ?? new Set<string>();
    set.add(row.node.slug);
    positiveByMovie.set(row.movieId, set);
  }

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
      embedding: { select: { vectorJson: true } },
    },
  });

  const labelMovieIds = new Set(positiveByMovie.keys());

  const genreHints = new Set(
    (input.genreHints && input.genreHints.length > 0 ? input.genreHints : [input.packSlug])
      .map((entry) => entry.trim().toLowerCase()),
  );
  const movies: ClassifierMovieInput[] = moviesRaw
    .map((movie) => ({
      id: movie.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      synopsis: movie.synopsis,
      genres: parseJsonStringArray(movie.genres),
      keywords: parseJsonStringArray(movie.keywords),
      country: movie.country,
      director: movie.director,
      cast: parseCastNames(movie.castTop),
      embeddingVector: Array.isArray(movie.embedding?.vectorJson)
        ? movie.embedding!.vectorJson.filter((entry): entry is number => typeof entry === 'number')
        : undefined,
    }))
    .filter((movie) => {
      if (labelMovieIds.has(movie.id)) return true;
      return movie.genres.some((genre) => genreHints.has(genre.toLowerCase()));
    });

  const rows: DatasetRow[] = movies.map((movie) => {
    const labels = positiveByMovie.get(movie.id) ?? new Set<string>();
    const labelByNode = Object.fromEntries(nodeSlugs.map((slug) => [slug, labels.has(slug) ? 1 : 0])) as Record<string, 0 | 1>;
    return { movie, labelByNode };
  });

  const trainRows: DatasetRow[] = [];
  const validationRows: DatasetRow[] = [];

  for (const row of rows) {
    const ratio = stableRatio(row.movie.id, input.splitSeed);
    if (ratio < (1 - input.validationRatio)) {
      trainRows.push(row);
    } else {
      validationRows.push(row);
    }
  }

  return {
    nodeSlugs,
    trainRows,
    validationRows,
    labelSourceReleaseId: release.id,
  };
}

export async function buildSeason1TrainingDataset(
  prisma: PrismaClient,
  input: BuildDatasetInput,
): Promise<BuiltDataset> {
  return buildSeasonTrainingDataset(prisma, {
    ...input,
    genreHints: input.genreHints ?? ['horror'],
  });
}

export async function buildSeason3TrainingDataset(
  prisma: PrismaClient,
  input: BuildDatasetInput,
): Promise<BuiltDataset> {
  return buildSeasonTrainingDataset(prisma, {
    ...input,
    genreHints: input.genreHints ?? ['science fiction', 'sci-fi', 'science-fiction', 'scifi'],
  });
}
