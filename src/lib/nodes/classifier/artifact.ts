import { readFile } from 'node:fs/promises';
import type { Season1NodeClassifierArtifact } from './types';

export async function loadSeason1ClassifierArtifact(path: string): Promise<Season1NodeClassifierArtifact> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as Season1NodeClassifierArtifact;

  if (parsed.artifactVersion !== 'season1-node-classifier-v1') {
    throw new Error(`Unsupported classifier artifact version: ${String((parsed as { artifactVersion?: unknown }).artifactVersion)}`);
  }
  if (!parsed.seasonSlug || !parsed.packSlug || !parsed.taxonomyVersion) {
    throw new Error('Classifier artifact missing season metadata');
  }
  if (!Array.isArray(parsed.featureSchema?.vocabulary) || parsed.featureSchema.vocabulary.length === 0) {
    throw new Error('Classifier artifact vocabulary is missing');
  }
  if (!Array.isArray(parsed.model?.nodes) || parsed.model.nodes.length === 0) {
    throw new Error('Classifier artifact node models are missing');
  }
  for (const node of parsed.model.nodes) {
    if (!node.slug || !Array.isArray(node.weights)) {
      throw new Error(`Invalid node model shape for slug=${node.slug}`);
    }
    if (typeof node.bias !== 'number' || typeof node.threshold !== 'number') {
      throw new Error(`Invalid node model parameters for slug=${node.slug}`);
    }
    if (node.weights.length !== parsed.featureSchema.vocabulary.length) {
      throw new Error(`Node model weight length mismatch for slug=${node.slug}`);
    }
  }

  return parsed;
}
