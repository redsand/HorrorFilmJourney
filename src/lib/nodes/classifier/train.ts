import type { BuiltDataset, NodeModel, Season1NodeClassifierArtifact, SeasonNodeClassifierArtifact } from './types.ts';
import { buildVocabulary, vectorizeMovie } from './features.ts';

type TrainInput = {
  seasonSlug: string;
  packSlug: string;
  taxonomyVersion: string;
  trainingRunId: string;
  dataset: BuiltDataset;
  seed: number;
  maxVocabulary: number;
  learningRate: number;
  epochs: number;
  l2: number;
  precisionFloor: number;
};

type BinaryMetrics = {
  precision: number;
  recall: number;
  f1: number;
};

function sigmoid(value: number): number {
  if (value < -30) {
    return 0;
  }
  if (value > 30) {
    return 1;
  }
  return 1 / (1 + Math.exp(-value));
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return total;
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

function averageVector(vectors: number[][]): number[] | null {
  if (vectors.length === 0) {
    return null;
  }
  const dim = vectors[0]!.length;
  if (dim === 0) {
    return null;
  }
  const out = new Array<number>(dim).fill(0);
  for (const vec of vectors) {
    if (vec.length !== dim) {
      return null;
    }
    for (let i = 0; i < dim; i += 1) {
      out[i] += vec[i] ?? 0;
    }
  }
  for (let i = 0; i < dim; i += 1) {
    out[i] /= vectors.length;
  }
  return out;
}

function evaluateBinary(y: number[], p: number[], threshold: number): BinaryMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < y.length; i += 1) {
    const pred = (p[i] ?? 0) >= threshold ? 1 : 0;
    const actual = y[i] ?? 0;
    if (pred === 1 && actual === 1) tp += 1;
    if (pred === 1 && actual === 0) fp += 1;
    if (pred === 0 && actual === 1) fn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

function calibrateThreshold(y: number[], p: number[], precisionFloor: number): { threshold: number; metrics: BinaryMetrics } {
  let best = { threshold: 0.5, metrics: evaluateBinary(y, p, 0.5) };

  for (let step = 20; step <= 90; step += 2) {
    const threshold = step / 100;
    const metrics = evaluateBinary(y, p, threshold);
    const meets = metrics.precision >= precisionFloor;
    const bestMeets = best.metrics.precision >= precisionFloor;

    if (
      (meets && !bestMeets)
      || (meets === bestMeets && (metrics.f1 > best.metrics.f1 || (metrics.f1 === best.metrics.f1 && threshold > best.threshold)))
    ) {
      best = { threshold, metrics };
    }
  }

  return best;
}

export function trainSeasonClassifier(input: TrainInput): SeasonNodeClassifierArtifact {
  const vocabulary = buildVocabulary(input.dataset.trainRows.map((row) => row.movie), input.maxVocabulary);
  const trainX = input.dataset.trainRows.map((row) => vectorizeMovie(row.movie, vocabulary));
  const valX = input.dataset.validationRows.map((row) => vectorizeMovie(row.movie, vocabulary));

  const nodeModels: NodeModel[] = [];
  let usedEmbeddingFeatures = false;

  for (const nodeSlug of input.dataset.nodeSlugs) {
    const yTrain = input.dataset.trainRows.map((row) => row.labelByNode[nodeSlug] ?? 0);
    const yVal = input.dataset.validationRows.map((row) => row.labelByNode[nodeSlug] ?? 0);

    const positiveEmbeddings = input.dataset.trainRows
      .filter((row) => (row.labelByNode[nodeSlug] ?? 0) === 1)
      .map((row) => row.movie.embeddingVector)
      .filter((vec): vec is number[] => Array.isArray(vec) && vec.length > 0);
    const prototype = averageVector(positiveEmbeddings);
    if (prototype && prototype.length > 0) {
      usedEmbeddingFeatures = true;
    }

    const protoTrain = input.dataset.trainRows.map((row) => cosineSimilarity(row.movie.embeddingVector, prototype ?? undefined));
    const protoVal = input.dataset.validationRows.map((row) => cosineSimilarity(row.movie.embeddingVector, prototype ?? undefined));

    const weights = new Array<number>(vocabulary.length).fill(0);
    let bias = 0;
    let protoWeight = 0;

    for (let epoch = 0; epoch < input.epochs; epoch += 1) {
      const gradW = new Array<number>(weights.length).fill(0);
      let gradB = 0;
      let gradProto = 0;

      for (let i = 0; i < trainX.length; i += 1) {
        const x = trainX[i]!;
        const y = yTrain[i] ?? 0;
        const z = bias + dot(weights, x) + protoWeight * (protoTrain[i] ?? 0);
        const pred = sigmoid(z);
        const err = pred - y;

        for (let j = 0; j < weights.length; j += 1) {
          gradW[j] = (gradW[j] ?? 0) + err * (x[j] ?? 0);
        }
        gradB += err;
        gradProto += err * (protoTrain[i] ?? 0);
      }

      const n = Math.max(1, trainX.length);
      for (let j = 0; j < weights.length; j += 1) {
        const w = weights[j] ?? 0;
        const g = (gradW[j] ?? 0) / n + input.l2 * w;
        weights[j] = w - input.learningRate * g;
      }
      bias -= input.learningRate * (gradB / n);
      protoWeight -= input.learningRate * ((gradProto / n) + input.l2 * protoWeight);
    }

    const valProb = valX.map((x, idx) => sigmoid(bias + dot(weights, x) + protoWeight * (protoVal[idx] ?? 0)));
    const calibrated = calibrateThreshold(yVal, valProb, input.precisionFloor);

    nodeModels.push({
      slug: nodeSlug,
      bias: Number(bias.toFixed(8)),
      weights: weights.map((w) => Number(w.toFixed(8))),
      protoWeight: Number(protoWeight.toFixed(8)),
      threshold: Number(calibrated.threshold.toFixed(4)),
      ...(prototype
        ? {
          prototypeEmbedding: {
            dim: prototype.length,
            vector: prototype.map((v) => Number(v.toFixed(8))),
          },
        }
        : {}),
      metrics: {
        validationF1: Number(calibrated.metrics.f1.toFixed(4)),
        validationPrecision: Number(calibrated.metrics.precision.toFixed(4)),
        validationRecall: Number(calibrated.metrics.recall.toFixed(4)),
        positivesTrain: yTrain.reduce<number>((sum, v) => sum + (v === 1 ? 1 : 0), 0),
        positivesValidation: yVal.reduce<number>((sum, v) => sum + (v === 1 ? 1 : 0), 0),
      },
    });
  }

  return {
    artifactVersion: 'season-node-classifier-v1',
    seasonSlug: input.seasonSlug,
    packSlug: input.packSlug,
    taxonomyVersion: input.taxonomyVersion,
    trainingRunId: input.trainingRunId,
    trainedAt: new Date().toISOString(),
    featureSchema: {
      version: 'v1',
      vocabulary,
    },
    model: {
      type: 'one-vs-rest-logreg',
      nodes: nodeModels,
      metadata: {
        seed: input.seed,
        trainSize: input.dataset.trainRows.length,
        validationSize: input.dataset.validationRows.length,
        valRatio: input.dataset.validationRows.length / Math.max(1, (input.dataset.trainRows.length + input.dataset.validationRows.length)),
        epochs: input.epochs,
        learningRate: input.learningRate,
        l2: input.l2,
        labelSourceReleaseId: input.dataset.labelSourceReleaseId,
        usedEmbeddingFeatures,
      },
    },
  };
}

export function trainSeason1Classifier(input: TrainInput): Season1NodeClassifierArtifact {
  return trainSeasonClassifier(input);
}
