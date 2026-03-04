import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  loadSeason1ClassifierArtifact,
  scoreMovieWithSeason1Classifier,
  type ClassifierMovieInput,
} from '@/lib/nodes/classifier';

describe('season1 classifier artifact', () => {
  it('loads deterministically', async () => {
    const path = resolve('tests/fixtures/season1-node-classifier-test-artifact.json');
    const first = await loadSeason1ClassifierArtifact(path);
    const second = await loadSeason1ClassifierArtifact(path);
    expect(second).toEqual(first);
  });

  it('produces stable probabilities for fixture movies', async () => {
    const artifact = await loadSeason1ClassifierArtifact(resolve('tests/fixtures/season1-node-classifier-test-artifact.json'));

    const movies: ClassifierMovieInput[] = [
      {
        id: 'm1',
        title: 'Masked Killer in Camp Woods',
        year: 1984,
        genres: ['horror', 'slasher'],
        keywords: ['masked killer'],
        country: 'United States',
        synopsis: 'A masked killer stalks teenagers.',
      },
      {
        id: 'm2',
        title: 'Ritual at the Village',
        year: 1973,
        genres: ['horror', 'folk-horror'],
        keywords: ['ritual'],
        country: 'United States',
        synopsis: 'A rural ritual turns ominous.',
      },
      {
        id: 'm3',
        title: 'General Horror Story',
        year: 1999,
        genres: ['horror'],
        keywords: [],
        country: 'United States',
        synopsis: 'A broad horror setup.',
      },
    ];

    const result = movies.map((movie) => ({
      id: movie.id,
      probabilities: scoreMovieWithSeason1Classifier(artifact, movie),
    }));

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "id": "m1",
          "probabilities": [
            {
              "nodeSlug": "slasher-serial-killer",
              "probability": 0.90025,
              "threshold": 0.58,
            },
            {
              "nodeSlug": "folk-horror",
              "probability": 0.154465,
              "threshold": 0.6,
            },
          ],
        },
        {
          "id": "m2",
          "probabilities": [
            {
              "nodeSlug": "folk-horror",
              "probability": 0.645656,
              "threshold": 0.6,
            },
            {
              "nodeSlug": "slasher-serial-killer",
              "probability": 0.310026,
              "threshold": 0.58,
            },
          ],
        },
        {
          "id": "m3",
          "probabilities": [
            {
              "nodeSlug": "folk-horror",
              "probability": 0.354344,
              "threshold": 0.6,
            },
            {
              "nodeSlug": "slasher-serial-killer",
              "probability": 0.354344,
              "threshold": 0.58,
            },
          ],
        },
      ]
    `);
  });
});
