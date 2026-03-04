import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scoreMovieForNodes } from '@/lib/nodes/scoring';
import type { SeasonOntology } from '@/lib/ontology/types';
import type { SeasonPrototypePack } from '@/lib/ontology/prototype-types';
import type { WeakSupervisionMovie } from '@/lib/nodes/weak-supervision';

type Season1Fixture = {
  movie: WeakSupervisionMovie;
  movieEmbedding: number[];
  nodeSlugs: string[];
};

const season1FixturePath = resolve(process.cwd(), 'tests', 'fixtures', 'node-scoring-season1.json');
const ontologyDir = resolve(process.cwd(), 'src', 'config', 'seasons', 'ontologies');
const prototypePackDir = resolve(process.cwd(), 'src', 'config', 'seasons', 'prototype-packs');
const genericSeasonId = 'season-generic-score';
const genericOntologyPath = resolve(ontologyDir, `${genericSeasonId}.json`);
const genericPrototypePath = resolve(prototypePackDir, `${genericSeasonId}.json`);

describe('node scoring', () => {
  beforeAll(() => {
    mkdirSync(ontologyDir, { recursive: true });
    mkdirSync(prototypePackDir, { recursive: true });

    const genericOntology: SeasonOntology = {
      seasonId: genericSeasonId,
      seasonSlug: 'generic-scoring',
      taxonomyVersion: 'generic-score-v1',
      nodes: [
        {
          slug: 'ritual-dread',
          name: 'Ritual Dread',
          description: 'Ritual-focused dread stories.',
          canonicalThemes: ['ritual', 'belief'],
          commonKeywords: ['ritual', 'pagan'],
          negativeSignals: ['slapstick'],
        },
        {
          slug: 'urban-pursuit',
          name: 'Urban Pursuit',
          description: 'City chase and pursuit-based terror.',
          canonicalThemes: ['pursuit', 'urban tension'],
          commonKeywords: ['city chase', 'pursuit'],
          negativeSignals: ['pastoral ritual'],
        },
      ],
    };
    const genericPrototype: SeasonPrototypePack = {
      seasonId: genericSeasonId,
      taxonomyVersion: 'generic-score-v1',
      nodes: [
        {
          nodeSlug: 'ritual-dread',
          positivePrototypes: [[1, 0, 0], [0.98, 0.02, 0]],
        },
        {
          nodeSlug: 'urban-pursuit',
          positivePrototypes: [[0, 1, 0], [0.02, 0.98, 0]],
        },
      ],
    };

    writeFileSync(genericOntologyPath, JSON.stringify(genericOntology, null, 2), 'utf8');
    writeFileSync(genericPrototypePath, JSON.stringify(genericPrototype, null, 2), 'utf8');
  });

  afterAll(() => {
    rmSync(genericOntologyPath, { force: true });
    rmSync(genericPrototypePath, { force: true });
  });

  it('scores Season 1 deterministically with weak + prototype evidence', () => {
    const fixture = JSON.parse(readFileSync(season1FixturePath, 'utf8')) as Season1Fixture;

    const first = scoreMovieForNodes({
      seasonId: 'season-1',
      taxonomyVersion: 'season-1-horror-v3.5',
      movie: fixture.movie,
      movieEmbedding: fixture.movieEmbedding,
      nodeSlugs: fixture.nodeSlugs,
    });
    const second = scoreMovieForNodes({
      seasonId: 'season-1',
      taxonomyVersion: 'season-1-horror-v3.5',
      movie: fixture.movie,
      movieEmbedding: fixture.movieEmbedding,
      nodeSlugs: fixture.nodeSlugs,
    });

    expect(second).toEqual(first);
    expect(first[0]?.nodeSlug).toBe('folk-horror');
    expect(first[0]?.prototypeScore).toBeGreaterThan(0.7);
    expect(first[0]?.evidence.weak.firedLfNames.length).toBeGreaterThan(0);
    expect(first[0]?.evidence.prototype.used).toBe(true);
  });

  it('works for a season without plugin using generic weak + prototype scoring', () => {
    const scores = scoreMovieForNodes({
      seasonId: genericSeasonId,
      taxonomyVersion: 'generic-score-v1',
      movie: {
        id: 'g1',
        title: 'Ritual of the Hollow City',
        year: 2022,
        genres: ['horror'],
        keywords: ['ritual', 'pagan'],
      },
      movieEmbedding: [1, 0, 0],
      nodeSlugs: ['ritual-dread', 'urban-pursuit'],
    });

    expect(scores[0]?.nodeSlug).toBe('ritual-dread');
    expect(scores[0]?.weakScore).toBeGreaterThan(0.45);
    expect(scores[0]?.prototypeScore).toBeGreaterThan(0.99);
    expect(scores[1]?.prototypeScore).toBeLessThan(0.6);
  });
});
