export type ClassifierMovieInput = {
  id: string;
  tmdbId?: number;
  title: string;
  year: number | null;
  genres: string[];
  synopsis?: string | null;
  keywords?: string[];
  country?: string | null;
  director?: string | null;
  cast?: string[];
  embeddingVector?: number[];
};

export type NodeModel = {
  slug: string;
  bias: number;
  weights: number[];
  protoWeight: number;
  threshold: number;
  prototypeEmbedding?: {
    dim: number;
    vector: number[];
  };
  metrics: {
    validationF1: number;
    validationPrecision: number;
    validationRecall: number;
    positivesTrain: number;
    positivesValidation: number;
  };
};

export type Season1NodeClassifierArtifact = {
  artifactVersion: 'season1-node-classifier-v1' | 'season-node-classifier-v1';
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
  trainingRunId: string;
  trainedAt: string;
  featureSchema: {
    version: 'v1';
    vocabulary: string[];
  };
  model: {
    type: 'one-vs-rest-logreg';
    nodes: NodeModel[];
    metadata: {
      seed: number;
      trainSize: number;
      validationSize: number;
      valRatio: number;
      epochs: number;
      learningRate: number;
      l2: number;
      labelSourceReleaseId: string;
      usedEmbeddingFeatures: boolean;
    };
  };
};

export type SeasonNodeClassifierArtifact = Season1NodeClassifierArtifact;

export type NodeProbability = {
  nodeSlug: string;
  probability: number;
  threshold: number;
};

export type DatasetRow = {
  movie: ClassifierMovieInput;
  labelByNode: Record<string, 0 | 1>;
};

export type BuiltDataset = {
  nodeSlugs: string[];
  trainRows: DatasetRow[];
  validationRows: DatasetRow[];
  labelSourceReleaseId: string;
};
