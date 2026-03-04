import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildSeasonLabelingFunctions,
  inferNodeProbabilities,
  type WeakSupervisionMovie,
} from '@/lib/nodes/weak-supervision';
import type { SeasonOntology } from '@/lib/ontology/types';

const ontologyDir = resolve(process.cwd(), 'src', 'config', 'seasons', 'ontologies');
const noPluginSeasonId = 'season-generic-test';
const noPluginOntologyPath = resolve(ontologyDir, `${noPluginSeasonId}.json`);

describe('season-driven weak supervision', () => {
  beforeAll(() => {
    mkdirSync(ontologyDir, { recursive: true });

    const ontology: SeasonOntology = {
      seasonId: noPluginSeasonId,
      seasonSlug: 'generic-test-pack',
      taxonomyVersion: 'generic-v1',
      nodes: [
        {
          slug: 'ritual-dread',
          name: 'Ritual Dread',
          description: 'Dread driven by ritual and inherited belief structures.',
          canonicalThemes: ['ritual', 'belief'],
          commonKeywords: ['ritual', 'pagan'],
          negativeSignals: ['slapstick comedy'],
        },
      ],
    };

    writeFileSync(noPluginOntologyPath, JSON.stringify(ontology, null, 2), 'utf8');
  });

  afterAll(() => {
    rmSync(noPluginOntologyPath, { force: true });
  });

  it('runs Season 1 with ontology-driven LFs and season plugin LFs', () => {
    const lfs = buildSeasonLabelingFunctions({
      seasonId: 'season-1',
      taxonomyVersion: 'season-1-horror-v3.5',
      nodeSlugs: ['folk-horror'],
    });

    expect(lfs.some((lf) => lf.name === 'folk-horror.LF_ontology_keyword_match')).toBe(true);
    expect(lfs.some((lf) => lf.name === 'folk-horror.LF_ontology_negative_signal')).toBe(true);
    expect(lfs.some((lf) => lf.name.includes('.positive.strong-tags'))).toBe(true);

    const movie: WeakSupervisionMovie = {
      id: 'm1',
      title: 'Ritual In The Woods',
      year: 2018,
      genres: ['horror', 'folk-horror', 'ritual'],
      keywords: ['pagan'],
    };

    const result = inferNodeProbabilities(movie, ['folk-horror'], lfs);
    expect(result[0]!.probability).toBeGreaterThan(0.5);
  });

  it('adds targeted recall LFs for starving season-1 nodes', () => {
    const lfs = buildSeasonLabelingFunctions({
      seasonId: 'season-1',
      taxonomyVersion: 'season-1-horror-v3.5',
      nodeSlugs: ['cosmic-horror', 'horror-comedy', 'experimental-horror', 'apocalyptic-horror', 'sci-fi-horror'],
    });

    expect(lfs.some((lf) => lf.name === 'cosmic-horror.LF_cosmic_keywords')).toBe(true);
    expect(lfs.some((lf) => lf.name === 'horror-comedy.LF_horror_comedy_tone')).toBe(true);
    expect(lfs.some((lf) => lf.name === 'experimental-horror.LF_experimental_structure')).toBe(true);
    expect(lfs.some((lf) => lf.name === 'apocalyptic-horror.LF_apocalyptic_keywords')).toBe(true);
    expect(lfs.some((lf) => lf.name === 'sci-fi-horror.LF_scifi_horror_keywords')).toBe(true);

    const cosmicLf = lfs.find((lf) => lf.name === 'cosmic-horror.LF_cosmic_keywords');
    const movie: WeakSupervisionMovie = {
      id: 'm3',
      title: 'Unknown Void Dimension',
      year: 2024,
      genres: ['horror', 'sci-fi'],
      keywords: ['lovecraft', 'cosmic', 'void'],
      synopsis: 'An alien signal opens a dimension and unleashes unknown terror.',
    };

    const fired = cosmicLf?.apply(movie);
    expect(fired).toBeDefined();
    expect(fired?.label).toBe(1);
    expect(fired?.confidence).toBeGreaterThan(0.6);
    expect(fired?.evidence?.length ?? 0).toBeGreaterThan(0);
  });

  it('works for seasons without a plugin using generic ontology LFs only', () => {
    const lfs = buildSeasonLabelingFunctions({
      seasonId: noPluginSeasonId,
      taxonomyVersion: 'generic-v1',
      nodeSlugs: ['ritual-dread'],
    });

    expect(lfs.length).toBeGreaterThan(0);
    expect(lfs.every((lf) => lf.name.includes('LF_'))).toBe(true);
    expect(lfs.some((lf) => lf.name.includes('.positive.strong-tags'))).toBe(false);

    const movie: WeakSupervisionMovie = {
      id: 'm2',
      title: 'Pagan Rite',
      year: 2020,
      genres: ['horror'],
      keywords: ['ritual', 'pagan'],
    };

    const result = inferNodeProbabilities(movie, ['ritual-dread'], lfs);
    expect(result[0]!.probability).toBeGreaterThan(0.5);
  });
});
