import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SeasonPrototypePack } from '@/lib/ontology/prototype-types';
import type { SeasonOntology } from '@/lib/ontology/types';
import { computeLocalTextEmbedding } from '@/lib/movie/local-embedding';
import { scoreMovieForNodes } from '@/lib/nodes/scoring';
import { scorePrototypeSimilarityForSeasonNodes } from '@/lib/nodes/scoring/prototypeSimilarity';

const seasonId = 'season-prototype-sim';
const taxonomyVersion = 'season-prototype-sim-v1';
const ontologyDir = resolve(process.cwd(), 'src', 'config', 'seasons', 'ontologies');
const prototypeDir = resolve(process.cwd(), 'src', 'config', 'seasons', 'prototype-packs');
const ontologyPath = resolve(ontologyDir, `${seasonId}.json`);
const prototypePath = resolve(prototypeDir, `${seasonId}.json`);

describe('prototype similarity scoring', () => {
  beforeAll(() => {
    mkdirSync(ontologyDir, { recursive: true });
    mkdirSync(prototypeDir, { recursive: true });

    const ontology: SeasonOntology = {
      seasonId,
      seasonSlug: 'prototype-sim',
      taxonomyVersion,
      nodes: [
        {
          slug: 'cosmic-horror',
          name: 'Cosmic Horror',
          description: 'Existential dread and unknown entities.',
          canonicalThemes: ['unknown entities'],
          commonKeywords: ['cosmic'],
          negativeSignals: ['romcom'],
        },
        {
          slug: 'folk-horror',
          name: 'Folk Horror',
          description: 'Ritual and rural belief systems.',
          canonicalThemes: ['ritual'],
          commonKeywords: ['folk'],
          negativeSignals: ['space station'],
        },
      ],
    };

    const pack: SeasonPrototypePack = {
      seasonId,
      taxonomyVersion,
      nodes: [
        {
          nodeSlug: 'cosmic-horror',
          positivePrototypes: [[0.9, 0.1, 0.1, 0.1]],
          positiveTitles: ['Alien', 'The Thing'],
        },
        {
          nodeSlug: 'folk-horror',
          positivePrototypes: [[0.1, 0.9, 0.1, 0.1]],
          positiveTitles: ['The Wicker Man'],
        },
      ],
    };

    writeFileSync(ontologyPath, JSON.stringify(ontology, null, 2), 'utf8');
    writeFileSync(prototypePath, JSON.stringify(pack, null, 2), 'utf8');
  });

  afterAll(() => {
    rmSync(ontologyPath, { force: true });
    rmSync(prototypePath, { force: true });
  });

  it('returns positive similarity for a prototype title embedding', () => {
    const embedding = computeLocalTextEmbedding('Alien', 4);
    const scores = scorePrototypeSimilarityForSeasonNodes({
      seasonId,
      taxonomyVersion,
      movieEmbedding: embedding,
      nodeSlugs: ['cosmic-horror'],
    });

    expect(scores).toHaveLength(1);
    expect(scores[0]?.prototypeScore).toBeGreaterThan(0.55);
    expect(scores[0]?.prototypeCount).toBeGreaterThan(1);
  });

  it('increases node score for similar horror films', () => {
    const similarEmbedding = [0.92, 0.11, 0.08, 0.09];
    const dissimilarEmbedding = [0.11, 0.92, 0.08, 0.09];

    const similar = scoreMovieForNodes({
      seasonId,
      taxonomyVersion,
      movie: {
        id: 'm1',
        title: 'Space Terror',
        year: 1979,
        genres: ['horror'],
        keywords: [],
      },
      movieEmbedding: similarEmbedding,
      nodeSlugs: ['cosmic-horror', 'folk-horror'],
      lfs: [],
    });
    const dissimilar = scoreMovieForNodes({
      seasonId,
      taxonomyVersion,
      movie: {
        id: 'm2',
        title: 'Village Rite',
        year: 1973,
        genres: ['horror'],
        keywords: [],
      },
      movieEmbedding: dissimilarEmbedding,
      nodeSlugs: ['cosmic-horror', 'folk-horror'],
      lfs: [],
    });

    const similarCosmic = similar.find((entry) => entry.nodeSlug === 'cosmic-horror');
    const dissimilarCosmic = dissimilar.find((entry) => entry.nodeSlug === 'cosmic-horror');

    expect(similarCosmic?.prototypeScore ?? 0).toBeGreaterThan(dissimilarCosmic?.prototypeScore ?? 0);
    expect(similarCosmic?.finalScore ?? 0).toBeGreaterThan(dissimilarCosmic?.finalScore ?? 0);
  });

  it('derives embedding when movieEmbedding is missing so prototype score still contributes', () => {
    const scores = scoreMovieForNodes({
      seasonId,
      taxonomyVersion,
      movie: {
        id: 'm3',
        title: 'Alien',
        year: 1979,
        genres: ['horror', 'sci-fi'],
        keywords: ['space', 'xenomorph'],
        synopsis: 'Crew encounters unknown organism in deep space.',
      },
      nodeSlugs: ['cosmic-horror', 'folk-horror'],
      lfs: [],
    });

    const cosmic = scores.find((entry) => entry.nodeSlug === 'cosmic-horror');
    const folk = scores.find((entry) => entry.nodeSlug === 'folk-horror');
    expect(cosmic).toBeDefined();
    expect((cosmic?.prototypeScore ?? 0) > 0).toBe(true);
    expect((cosmic?.prototypeScore ?? 0)).toBeGreaterThan(folk?.prototypeScore ?? 0);
    expect(cosmic?.evidence.prototype.used).toBe(true);
  });
});
