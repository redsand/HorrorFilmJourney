import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { OntologyNode, SeasonOntology } from './types';
import { SEASON_ONTOLOGIES } from '@/ontology/seasons';

const SEASON_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ONTOLOGY_DIRECTORY = resolve(process.cwd(), 'src', 'config', 'seasons', 'ontologies');

function asNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ontology: ${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid ontology: ${fieldName} must not be empty`);
  }
  return trimmed;
}

function asStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ontology: ${fieldName} must be an array`);
  }
  return value.map((entry, index) => asNonEmptyString(entry, `${fieldName}[${index}]`));
}

function asOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }
  return asStringArray(value, fieldName);
}

function validateSlug(value: string, fieldName: string): void {
  if (!SLUG_REGEX.test(value)) {
    throw new Error(`Invalid ontology: ${fieldName} must match ${SLUG_REGEX.source}`);
  }
}

function validateNode(node: OntologyNode, index: number, nodeSlugSet: Set<string>): void {
  validateSlug(node.slug, `nodes[${index}].slug`);
  if (nodeSlugSet.has(node.slug)) {
    throw new Error(`Invalid ontology: duplicate node slug "${node.slug}"`);
  }
  nodeSlugSet.add(node.slug);
  asNonEmptyString(node.name, `nodes[${index}].name`);
  asNonEmptyString(node.description, `nodes[${index}].description`);
}

export function validateSeasonOntology(ontology: SeasonOntology): SeasonOntology {
  const seasonId = asNonEmptyString(ontology.seasonId, 'seasonId');
  if (!SEASON_ID_REGEX.test(seasonId)) {
    throw new Error(`Invalid ontology: seasonId must match ${SEASON_ID_REGEX.source}`);
  }
  validateSlug(asNonEmptyString(ontology.seasonSlug, 'seasonSlug'), 'seasonSlug');
  asNonEmptyString(ontology.taxonomyVersion, 'taxonomyVersion');

  if (!Array.isArray(ontology.nodes) || ontology.nodes.length === 0) {
    throw new Error('Invalid ontology: nodes must be a non-empty array');
  }

  const nodeSlugSet = new Set<string>();
  ontology.nodes.forEach((node, index) => {
    validateNode(node, index, nodeSlugSet);

    asStringArray(node.canonicalThemes, `nodes[${index}].canonicalThemes`);
    asStringArray(node.commonKeywords, `nodes[${index}].commonKeywords`);
    asStringArray(node.negativeSignals, `nodes[${index}].negativeSignals`);
    asOptionalStringArray(node.typicalEra, `nodes[${index}].typicalEra`);
    asOptionalStringArray(node.requiredEvidence, `nodes[${index}].requiredEvidence`);

    if (node.relationships) {
      node.relationships.forEach((relationship, relIndex) => {
        validateSlug(
          asNonEmptyString(relationship.targetSlug, `nodes[${index}].relationships[${relIndex}].targetSlug`),
          `nodes[${index}].relationships[${relIndex}].targetSlug`,
        );
        asNonEmptyString(relationship.type, `nodes[${index}].relationships[${relIndex}].type`);
      });
    }

    if (node.keywordRules) {
      node.keywordRules.forEach((rule, ruleIndex) => {
        asNonEmptyString(rule.keyword, `nodes[${index}].keywordRules[${ruleIndex}].keyword`);
        if (typeof rule.weight !== 'undefined' && !Number.isFinite(rule.weight)) {
          throw new Error(`Invalid ontology: nodes[${index}].keywordRules[${ruleIndex}].weight must be finite`);
        }
        if (typeof rule.polarity !== 'undefined' && rule.polarity !== 'positive' && rule.polarity !== 'negative') {
          throw new Error(`Invalid ontology: nodes[${index}].keywordRules[${ruleIndex}].polarity must be "positive" or "negative"`);
        }
      });
    }
  });

  ontology.nodes.forEach((node, index) => {
    node.relationships?.forEach((relationship, relIndex) => {
      if (!nodeSlugSet.has(relationship.targetSlug)) {
        throw new Error(
          `Invalid ontology: nodes[${index}].relationships[${relIndex}].targetSlug "${relationship.targetSlug}" does not exist`,
        );
      }
    });
  });

  return ontology;
}

export function loadSeasonOntology(seasonId: string): SeasonOntology {
  const normalizedSeasonId = asNonEmptyString(seasonId, 'seasonId');
  if (!SEASON_ID_REGEX.test(normalizedSeasonId)) {
    throw new Error(`Invalid ontology request: seasonId must match ${SEASON_ID_REGEX.source}`);
  }

  const inMemory = SEASON_ONTOLOGIES.find((ontology) => ontology.seasonId === normalizedSeasonId);
  if (inMemory) {
    return validateSeasonOntology(structuredClone(inMemory));
  }

  const ontologyPath = join(ONTOLOGY_DIRECTORY, `${normalizedSeasonId}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(ontologyPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Failed to load ontology for "${normalizedSeasonId}" from ${ontologyPath}: ${(error as Error).message}`);
  }

  return validateSeasonOntology(parsed as SeasonOntology);
}
