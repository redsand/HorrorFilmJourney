import { describe, expect, it } from 'vitest';
import { buildEvidenceDedupKey } from '@/lib/evidence/evidence-dedupe';

describe('buildEvidenceDedupKey', () => {
  it('generates same key for equivalent payload values', () => {
    const a = buildEvidenceDedupKey({
      movieId: 'movie_1',
      sourceName: 'IMDb',
      url: 'https://example.com/evidence',
      snippet: 'A useful citation snippet.',
    });

    const b = buildEvidenceDedupKey({
      movieId: 'movie_1',
      sourceName: ' imdb ',
      url: 'https://example.com/evidence',
      snippet: 'A useful citation snippet.',
    });

    expect(a).toBe(b);
  });

  it('changes key when snippet changes', () => {
    const a = buildEvidenceDedupKey({
      movieId: 'movie_1',
      sourceName: 'IMDb',
      url: 'https://example.com/evidence',
      snippet: 'Snippet A',
    });

    const b = buildEvidenceDedupKey({
      movieId: 'movie_1',
      sourceName: 'IMDb',
      url: 'https://example.com/evidence',
      snippet: 'Snippet B',
    });

    expect(a).not.toBe(b);
  });

  it('treats missing and empty url as equivalent', () => {
    const a = buildEvidenceDedupKey({
      movieId: 'movie_1',
      sourceName: 'IMDb',
      snippet: 'Snippet A',
    });

    const b = buildEvidenceDedupKey({
      movieId: 'movie_1',
      sourceName: 'IMDb',
      url: '',
      snippet: 'Snippet A',
    });

    expect(a).toBe(b);
  });
});
