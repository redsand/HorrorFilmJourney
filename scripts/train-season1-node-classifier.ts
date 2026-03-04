import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  buildSeason1TrainingDataset,
  trainSeason1Classifier,
} from '../src/lib/nodes/classifier/index.ts';

type Cli = {
  taxonomyVersion?: string;
  outputDir?: string;
};

function parseCli(): Cli {
  const out: Cli = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--taxonomy-version=')) {
      out.taxonomyVersion = arg.slice('--taxonomy-version='.length).trim();
    } else if (arg.startsWith('--output-dir=')) {
      out.outputDir = arg.slice('--output-dir='.length).trim();
    }
  }
  return out;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main(): Promise<void> {
  const cli = parseCli();
  const prisma = new PrismaClient();

  const seed = parseIntEnv('SEASON1_CLASSIFIER_SEED', 42);
  const validationRatio = Math.min(0.4, Math.max(0.1, parseFloatEnv('SEASON1_CLASSIFIER_VAL_RATIO', 0.2)));
  const maxVocabulary = parseIntEnv('SEASON1_CLASSIFIER_MAX_VOCAB', 1600);
  const epochs = parseIntEnv('SEASON1_CLASSIFIER_EPOCHS', 220);
  const learningRate = parseFloatEnv('SEASON1_CLASSIFIER_LR', 0.08);
  const l2 = parseFloatEnv('SEASON1_CLASSIFIER_L2', 0.0005);
  const precisionFloor = Math.min(1, Math.max(0, parseFloatEnv('SEASON1_CLASSIFIER_PRECISION_FLOOR', 0.55)));

  try {
    const dataset = await buildSeason1TrainingDataset(prisma, {
      seasonSlug: 'season-1',
      packSlug: 'horror',
      taxonomyVersion: cli.taxonomyVersion,
      validationRatio,
      splitSeed: seed,
    });

    const seasonRelease = await prisma.seasonNodeRelease.findUnique({
      where: { id: dataset.labelSourceReleaseId },
      select: { taxonomyVersion: true },
    });
    if (!seasonRelease) {
      throw new Error('Could not resolve taxonomyVersion from label source release');
    }

    const runId = process.env.SEASON1_CLASSIFIER_RUN_ID?.trim() || `season1-node-classifier-${new Date().toISOString()}`;

    const artifact = trainSeason1Classifier({
      seasonSlug: 'season-1',
      packSlug: 'horror',
      taxonomyVersion: seasonRelease.taxonomyVersion,
      trainingRunId: runId,
      dataset,
      seed,
      maxVocabulary,
      learningRate,
      epochs,
      l2,
      precisionFloor,
    });

    const outputDir = resolve(cli.outputDir ?? `artifacts/season1-node-classifier/${artifact.taxonomyVersion}`);
    await mkdir(outputDir, { recursive: true });

    const datasetPath = resolve(outputDir, 'dataset.json');
    const artifactPath = resolve(outputDir, 'model.json');

    await writeFile(datasetPath, `${JSON.stringify({
      seasonSlug: 'season-1',
      packSlug: 'horror',
      taxonomyVersion: artifact.taxonomyVersion,
      labelSourceReleaseId: dataset.labelSourceReleaseId,
      splitSeed: seed,
      validationRatio,
      trainRows: dataset.trainRows,
      validationRows: dataset.validationRows,
    }, null, 2)}\n`, 'utf8');

    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

    console.log(`Season 1 classifier training complete: taxonomyVersion=${artifact.taxonomyVersion} runId=${artifact.trainingRunId}`);
    console.log(`Artifact: ${artifactPath}`);
    console.log(`Dataset: ${datasetPath}`);
    console.log(`Train rows: ${artifact.model.metadata.trainSize} | Validation rows: ${artifact.model.metadata.validationSize}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 classifier training failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
