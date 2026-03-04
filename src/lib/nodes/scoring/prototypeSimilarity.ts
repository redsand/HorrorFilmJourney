import { loadSeasonOntology } from '@/lib/ontology/loadSeasonOntology';
import { loadSeasonPrototypePack } from '@/lib/ontology/loadSeasonPrototypePack';

export type PrototypeNodeScore = {
  nodeSlug: string;
  prototypeScore: number;
  rawCosineSimilarity: number;
  centroidDim: number;
  prototypeCount: number;
};

export type ScorePrototypeSimilarityInput = {
  seasonId: string;
  taxonomyVersion?: string;
  movieEmbedding: number[];
  nodeSlugs?: string[];
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA <= 0 || normB <= 0) {
    return 0;
  }
  return dot / Math.sqrt(normA * normB);
}

function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }
  const dim = vectors[0]!.length;
  const out = new Array<number>(dim).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dim; i += 1) {
      out[i] = (out[i] ?? 0) + (vector[i] ?? 0);
    }
  }
  return out.map((value) => value / vectors.length);
}

export function scorePrototypeSimilarityForSeasonNodes(input: ScorePrototypeSimilarityInput): PrototypeNodeScore[] {
  if (!Array.isArray(input.movieEmbedding) || input.movieEmbedding.length === 0) {
    throw new Error('movieEmbedding must be a non-empty numeric vector');
  }
  if (!input.movieEmbedding.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    throw new Error('movieEmbedding must contain only finite numbers');
  }

  const ontology = loadSeasonOntology(input.seasonId);
  const taxonomyVersion = input.taxonomyVersion ?? ontology.taxonomyVersion;
  if (taxonomyVersion !== ontology.taxonomyVersion) {
    throw new Error(
      `Ontology taxonomy mismatch for ${input.seasonId}: expected ${taxonomyVersion}, got ${ontology.taxonomyVersion}`,
    );
  }
  const prototypePack = loadSeasonPrototypePack(input.seasonId, taxonomyVersion);
  const allowed = input.nodeSlugs ? new Set(input.nodeSlugs) : null;
  const prototypesByNode = new Map(
    prototypePack.nodes.map((node) => [node.nodeSlug, node.positivePrototypes] as const),
  );

  return ontology.nodes
    .filter((node) => (allowed ? allowed.has(node.slug) : true))
    .map((node) => {
      const prototypes = prototypesByNode.get(node.slug) ?? [];
      const compatible = prototypes.filter((vector) => vector.length === input.movieEmbedding.length);
      if (compatible.length === 0) {
        return {
          nodeSlug: node.slug,
          prototypeScore: 0,
          rawCosineSimilarity: 0,
          centroidDim: 0,
          prototypeCount: 0,
        };
      }

      const centroid = averageVectors(compatible);
      const rawCosineSimilarity = cosineSimilarity(input.movieEmbedding, centroid);
      const prototypeScore = clamp01((rawCosineSimilarity + 1) / 2);

      return {
        nodeSlug: node.slug,
        prototypeScore: Number(prototypeScore.toFixed(6)),
        rawCosineSimilarity: Number(rawCosineSimilarity.toFixed(6)),
        centroidDim: centroid.length,
        prototypeCount: compatible.length,
      };
    })
    .sort((a, b) => (b.prototypeScore - a.prototypeScore) || a.nodeSlug.localeCompare(b.nodeSlug));
}

