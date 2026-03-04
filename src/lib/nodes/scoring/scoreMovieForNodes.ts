import { loadSeasonOntology } from '@/lib/ontology/loadSeasonOntology';
import { buildSeasonLabelingFunctions } from '@/lib/nodes/weak-supervision/lfs';
import { inferNodeProbabilities } from '@/lib/nodes/weak-supervision/label-model';
import type { LabelingFunction, WeakSupervisionMovie } from '@/lib/nodes/weak-supervision/types';
import { computeLocalMovieEmbedding, LOCAL_MOVIE_EMBEDDING_DIM } from '@/lib/movie/local-embedding';
import { scorePrototypeSimilarityForSeasonNodes } from './prototypeSimilarity';

export type NodeScoreEvidence = {
  weak: {
    firedCount: number;
    firedLfNames: string[];
    positiveWeight: number;
    negativeWeight: number;
  };
  prototype: {
    rawCosineSimilarity: number;
    centroidDim: number;
    prototypeCount: number;
    used: boolean;
  };
};

export type NodeScore = {
  nodeSlug: string;
  weakScore: number;
  prototypeScore: number;
  finalScore: number;
  evidence: NodeScoreEvidence;
};

export type ScoreMovieForNodesInput = {
  seasonId: string;
  taxonomyVersion?: string;
  movie: WeakSupervisionMovie;
  movieEmbedding?: number[];
  nodeSlugs?: string[];
  lfs?: LabelingFunction[];
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function isFiniteEmbedding(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function resolveMovieEmbedding(input: ScoreMovieForNodesInput): number[] {
  if (isFiniteEmbedding(input.movieEmbedding)) {
    return input.movieEmbedding;
  }
  return computeLocalMovieEmbedding({
    title: input.movie.title,
    year: input.movie.year,
    synopsis: input.movie.synopsis,
    genres: input.movie.genres,
    keywords: input.movie.keywords,
  }, LOCAL_MOVIE_EMBEDDING_DIM);
}

export function scoreMovieForNodes(input: ScoreMovieForNodesInput): NodeScore[] {
  const ontology = loadSeasonOntology(input.seasonId);
  const taxonomyVersion = input.taxonomyVersion ?? ontology.taxonomyVersion;
  if (taxonomyVersion !== ontology.taxonomyVersion) {
    throw new Error(
      `Taxonomy version mismatch for ${input.seasonId}: expected ${taxonomyVersion}, got ${ontology.taxonomyVersion}`,
    );
  }

  const nodeSlugs = input.nodeSlugs ?? ontology.nodes.map((node) => node.slug);
  const lfs = input.lfs ?? buildSeasonLabelingFunctions({
    seasonId: input.seasonId,
    taxonomyVersion,
    nodeSlugs,
  });
  const weakScores = inferNodeProbabilities(input.movie, nodeSlugs, lfs);
  const weakByNode = new Map(weakScores.map((entry) => [entry.nodeSlug, entry] as const));
  const movieEmbedding = resolveMovieEmbedding(input);
  const prototypeScores = scorePrototypeSimilarityForSeasonNodes({
    seasonId: input.seasonId,
    taxonomyVersion,
    movieEmbedding,
    nodeSlugs,
  });
  const prototypeByNode = new Map(prototypeScores.map((entry) => [entry.nodeSlug, entry] as const));

  return nodeSlugs.map((nodeSlug) => {
    const weak = weakByNode.get(nodeSlug);
    const prototype = prototypeByNode.get(nodeSlug);
    const weakScore = weak?.probability ?? 0;
    const prototypeScore = prototype?.prototypeScore ?? 0;
    const usePrototype = Boolean(prototype);
    const finalScore = usePrototype
      ? clamp01((weakScore * 0.65) + (prototypeScore * 0.35))
      : clamp01(weakScore);

    return {
      nodeSlug,
      weakScore: Number(weakScore.toFixed(6)),
      prototypeScore: Number(prototypeScore.toFixed(6)),
      finalScore: Number(finalScore.toFixed(6)),
      evidence: {
        weak: {
          firedCount: weak?.fired.length ?? 0,
          firedLfNames: (weak?.fired ?? []).map((entry) => entry.lfName).slice(0, 12),
          positiveWeight: Number((weak?.positiveWeight ?? 0).toFixed(6)),
          negativeWeight: Number((weak?.negativeWeight ?? 0).toFixed(6)),
        },
        prototype: {
          rawCosineSimilarity: Number((prototype?.rawCosineSimilarity ?? 0).toFixed(6)),
          centroidDim: prototype?.centroidDim ?? 0,
          prototypeCount: prototype?.prototypeCount ?? 0,
          used: usePrototype,
        },
      },
    };
  }).sort((a, b) => (b.finalScore - a.finalScore) || a.nodeSlug.localeCompare(b.nodeSlug));
}
