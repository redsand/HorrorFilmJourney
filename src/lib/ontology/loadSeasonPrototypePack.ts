import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadSeasonOntology } from './loadSeasonOntology';
import type { SeasonPrototypePack } from './prototype-types';
import { SEASON_PROTOTYPE_PACKS } from '@/ontology/prototypes/seasons';

const SEASON_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROTOTYPE_DIRECTORY = resolve(process.cwd(), 'src', 'config', 'seasons', 'prototype-packs');
const SEASON_2_LEGACY_TAXONOMY = 'season-2-cult-v1';
const SEASON_2_CURRENT_TAXONOMY = 'season-2-cult-v3';
const SEASON_2_NODE_ALIASES: Record<string, string> = {
  'birth-of-midnight': 'origins-of-cult-cinema',
  'so-bad-its-good': 'psychotronic-cinema',
  'cult-sci-fi-fantasy': 'cult-science-fiction',
  'punk-counterculture': 'outsider-cinema',
  'vhs-video-store-era': 'video-store-era',
  'cult-comedy-absurdism': 'camp-cult-comedy',
};

function asNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid prototype pack: ${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid prototype pack: ${fieldName} must not be empty`);
  }
  return trimmed;
}

function asVector(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid prototype pack: ${fieldName} must be a non-empty numeric array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new Error(`Invalid prototype pack: ${fieldName}[${index}] must be a finite number`);
    }
    return entry;
  });
}

function asOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`Invalid prototype pack: ${fieldName} must be a string array`);
  }
  const normalized = value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`Invalid prototype pack: ${fieldName}[${index}] must be a string`);
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      throw new Error(`Invalid prototype pack: ${fieldName}[${index}] must not be empty`);
    }
    return trimmed;
  });
  const deduped = [...new Set(normalized)];
  if (deduped.length !== normalized.length) {
    throw new Error(`Invalid prototype pack: ${fieldName} contains duplicates`);
  }
  return deduped;
}

function applyPrototypePackCompatibility(pack: SeasonPrototypePack): SeasonPrototypePack {
  if (pack.seasonId !== 'season-2' || pack.taxonomyVersion !== SEASON_2_LEGACY_TAXONOMY) {
    return pack;
  }

  return {
    ...pack,
    taxonomyVersion: SEASON_2_CURRENT_TAXONOMY,
    nodes: pack.nodes.map((node) => ({
      ...node,
      nodeSlug: SEASON_2_NODE_ALIASES[node.nodeSlug] ?? node.nodeSlug,
    })),
  };
}

function validateSeasonPrototypePack(pack: SeasonPrototypePack, requestedTaxonomyVersion?: string): SeasonPrototypePack {
  const compatiblePack = applyPrototypePackCompatibility(pack);
  const seasonId = asNonEmptyString(compatiblePack.seasonId, 'seasonId');
  if (!SEASON_ID_REGEX.test(seasonId)) {
    throw new Error(`Invalid prototype pack: seasonId must match ${SEASON_ID_REGEX.source}`);
  }
  const taxonomyVersion = asNonEmptyString(compatiblePack.taxonomyVersion, 'taxonomyVersion');
  if (requestedTaxonomyVersion && taxonomyVersion !== requestedTaxonomyVersion) {
    throw new Error(`Prototype taxonomy mismatch: expected ${requestedTaxonomyVersion}, got ${taxonomyVersion}`);
  }

  if (!Array.isArray(compatiblePack.nodes) || compatiblePack.nodes.length === 0) {
    throw new Error('Invalid prototype pack: nodes must be a non-empty array');
  }

  const ontology = loadSeasonOntology(compatiblePack.seasonId);
  const ontologyNodeSlugs = new Set(ontology.nodes.map((node) => node.slug));
  const seenNodeSlugs = new Set<string>();
  let vectorDim: number | null = null;

  for (const [nodeIndex, node] of compatiblePack.nodes.entries()) {
    const nodeSlug = asNonEmptyString(node.nodeSlug, `nodes[${nodeIndex}].nodeSlug`);
    if (!ontologyNodeSlugs.has(nodeSlug)) {
      throw new Error(`Invalid prototype pack: node "${nodeSlug}" does not exist in ontology`);
    }
    if (seenNodeSlugs.has(nodeSlug)) {
      throw new Error(`Invalid prototype pack: duplicate nodeSlug "${nodeSlug}"`);
    }
    seenNodeSlugs.add(nodeSlug);

    if (!Array.isArray(node.positivePrototypes) || node.positivePrototypes.length === 0) {
      throw new Error(`Invalid prototype pack: nodes[${nodeIndex}].positivePrototypes must be a non-empty array`);
    }
    for (const [vectorIndex, vector] of node.positivePrototypes.entries()) {
      const parsedVector = asVector(vector, `nodes[${nodeIndex}].positivePrototypes[${vectorIndex}]`);
      if (vectorDim === null) {
        vectorDim = parsedVector.length;
      } else if (parsedVector.length !== vectorDim) {
        throw new Error(
          `Invalid prototype pack: nodes[${nodeIndex}].positivePrototypes[${vectorIndex}] dimension mismatch (expected ${vectorDim}, got ${parsedVector.length})`,
        );
      }
    }

    asOptionalStringArray(node.positiveTitles, `nodes[${nodeIndex}].positiveTitles`);
    asOptionalStringArray(node.negativeTitles, `nodes[${nodeIndex}].negativeTitles`);
  }

  return compatiblePack;
}

export function loadSeasonPrototypePack(seasonId: string, taxonomyVersion?: string): SeasonPrototypePack {
  const normalizedSeasonId = asNonEmptyString(seasonId, 'seasonId');
  if (!SEASON_ID_REGEX.test(normalizedSeasonId)) {
    throw new Error(`Invalid prototype pack request: seasonId must match ${SEASON_ID_REGEX.source}`);
  }

  const inMemory = SEASON_PROTOTYPE_PACKS.find((pack) => pack.seasonId === normalizedSeasonId);
  if (inMemory) {
    return validateSeasonPrototypePack(structuredClone(inMemory), taxonomyVersion);
  }

  const packPath = join(PROTOTYPE_DIRECTORY, `${normalizedSeasonId}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Failed to load prototype pack for "${normalizedSeasonId}" from ${packPath}: ${(error as Error).message}`);
  }

  return validateSeasonPrototypePack(parsed as SeasonPrototypePack, taxonomyVersion);
}
