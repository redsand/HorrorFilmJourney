import type { ClassifierMovieInput, NodeProbability, Season1NodeClassifierArtifact, SeasonNodeClassifierArtifact } from './types';
import { vectorizeMovie } from './features';

function sigmoid(value: number): number {
  if (value < -30) return 0;
  if (value > 30) return 1;
  return 1 / (1 + Math.exp(-value));
}

function dot(a: number[], b: number[]): number {
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return out;
}

function cosineSimilarity(a?: number[], b?: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    num += av * bv;
    da += av * av;
    db += bv * bv;
  }
  if (da <= 0 || db <= 0) {
    return 0;
  }
  return num / Math.sqrt(da * db);
}

export function scoreMovieWithSeasonClassifier(
  artifact: SeasonNodeClassifierArtifact,
  movie: ClassifierMovieInput,
  nodeSlugs?: string[],
): NodeProbability[] {
  const vector = vectorizeMovie(movie, artifact.featureSchema.vocabulary);
  const filter = nodeSlugs ? new Set(nodeSlugs) : null;

  return artifact.model.nodes
    .filter((node) => (filter ? filter.has(node.slug) : true))
    .map((node) => {
      const prototype = node.prototypeEmbedding?.vector;
      const protoSim = cosineSimilarity(movie.embeddingVector, prototype);
      const z = node.bias + dot(node.weights, vector) + node.protoWeight * protoSim;
      const probability = sigmoid(z);
      return {
        nodeSlug: node.slug,
        probability: Number(probability.toFixed(6)),
        threshold: node.threshold,
      };
    })
    .sort((a, b) => (b.probability - a.probability) || a.nodeSlug.localeCompare(b.nodeSlug));
}

export function scoreMovieWithSeason1Classifier(
  artifact: Season1NodeClassifierArtifact,
  movie: ClassifierMovieInput,
  nodeSlugs?: string[],
): NodeProbability[] {
  return scoreMovieWithSeasonClassifier(artifact, movie, nodeSlugs);
}

export function scoreMovieWithSeason3Classifier(
  artifact: SeasonNodeClassifierArtifact,
  movie: ClassifierMovieInput,
  nodeSlugs?: string[],
): NodeProbability[] {
  return scoreMovieWithSeasonClassifier(artifact, movie, nodeSlugs);
}
