import { describe, expect, it } from 'vitest';
import {
  normalizeAndDedupeEvidenceDocuments,
  normalizeEvidenceDocumentInput,
} from '@/lib/evidence/ingestion';

describe('evidence ingestion adapters', () => {
  it('normalizes whitespace and trims ingest fields', () => {
    const normalized = normalizeEvidenceDocumentInput({
      movieId: ' movie_1 ',
      sourceName: '  Criterion   Collection ',
      url: ' https://criterion.com/essay ',
      title: '  A   Long  Essay ',
      content: '  line one   line two   ',
      seasonSlug: ' season-2 ',
    });

    expect(normalized).toEqual({
      movieId: 'movie_1',
      sourceName: 'Criterion Collection',
      url: 'https://criterion.com/essay',
      title: 'A Long Essay',
      content: 'line one line two',
      seasonSlug: 'season-2',
    });
  });

  it('filters invalid rows and dedupes deterministic duplicates', () => {
    const docs = normalizeAndDedupeEvidenceDocuments([
      {
        movieId: 'movie_1',
        sourceName: 'Criterion',
        url: 'https://criterion.com/essay',
        title: 'Essay',
        content: 'A',
      },
      {
        movieId: 'movie_1',
        sourceName: ' Criterion ',
        url: 'https://criterion.com/essay',
        title: 'Essay',
        content: 'A newer duplicate row',
      },
      {
        movieId: 'movie_2',
        sourceName: 'Missing title row',
        url: 'https://invalid.example',
        content: 'invalid',
      },
    ]);

    expect(docs).toHaveLength(1);
    expect(docs[0]?.movieId).toBe('movie_1');
  });
});
