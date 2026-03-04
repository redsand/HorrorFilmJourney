import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSeasonOntology, validateSeasonOntology } from '@/lib/ontology/loadSeasonOntology';
import type { SeasonOntology } from '@/lib/ontology/types';

const ontologyDir = resolve(process.cwd(), 'src', 'config', 'seasons', 'ontologies');
const testSeasonId = 'season-test-valid';
const testSeasonPath = resolve(ontologyDir, `${testSeasonId}.json`);

const validOntology: SeasonOntology = {
  seasonId: testSeasonId,
  seasonSlug: 'horror-classics',
  taxonomyVersion: 'v1.0.0',
  nodes: [
    {
      slug: 'folk-horror',
      name: 'Folk Horror',
      description: 'Rituals, rural dread, and inherited myths.',
      canonicalThemes: ['ritual', 'isolation'],
      commonKeywords: ['pagan', 'rural', 'cult'],
      negativeSignals: ['slapstick'],
      typicalEra: ['1960s', '1970s'],
      requiredEvidence: ['ritual motif'],
      relationships: [{ targetSlug: 'psychological-horror', type: 'adjacent' }],
      keywordRules: [{ keyword: 'ritual', weight: 1, polarity: 'positive' }],
    },
    {
      slug: 'psychological-horror',
      name: 'Psychological Horror',
      description: 'Inner dread and unstable perception.',
      canonicalThemes: ['paranoia', 'identity'],
      commonKeywords: ['obsession', 'delusion'],
      negativeSignals: ['broad comedy'],
    },
  ],
};

function writeSeasonOntology(seasonId: string, ontology: SeasonOntology): void {
  writeFileSync(resolve(ontologyDir, `${seasonId}.json`), JSON.stringify(ontology, null, 2), 'utf8');
}

describe('season ontology loading and validation', () => {
  beforeAll(() => {
    mkdirSync(ontologyDir, { recursive: true });
    writeSeasonOntology(testSeasonId, validOntology);
  });

  afterAll(() => {
    rmSync(testSeasonPath, { force: true });
  });

  it('loads ontology deterministically across repeated calls', () => {
    const first = loadSeasonOntology(testSeasonId);
    const second = loadSeasonOntology(testSeasonId);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);

    first.nodes[0]!.name = 'Changed In Test';
    const third = loadSeasonOntology(testSeasonId);
    expect(third.nodes[0]!.name).toBe('Folk Horror');
  });

  it('validates node slug uniqueness', () => {
    const duplicateNodes: SeasonOntology = {
      ...validOntology,
      nodes: [
        validOntology.nodes[0]!,
        {
          ...validOntology.nodes[1]!,
          slug: validOntology.nodes[0]!.slug,
        },
      ],
    };

    expect(() => validateSeasonOntology(duplicateNodes)).toThrow(/duplicate node slug/i);
  });

  it('validates slug format and non-empty descriptions', () => {
    const invalidSlug: SeasonOntology = {
      ...validOntology,
      nodes: [{ ...validOntology.nodes[0]!, slug: 'Bad Slug' }],
    };
    expect(() => validateSeasonOntology(invalidSlug)).toThrow(/must match/i);

    const emptyDescription: SeasonOntology = {
      ...validOntology,
      nodes: [{ ...validOntology.nodes[0]!, description: '   ' }],
    };
    expect(() => validateSeasonOntology(emptyDescription)).toThrow(/description.*must not be empty/i);
  });
});

