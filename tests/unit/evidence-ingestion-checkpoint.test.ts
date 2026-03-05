import { describe, expect, it } from 'vitest';
import {
  createEmptyEvidenceIngestionCheckpoint,
  filterPendingEvidenceDocuments,
  markEvidenceDocumentInCheckpoint,
} from '@/lib/evidence/ingestion/checkpoint';
import type { EvidenceIngestDocumentInput } from '@/lib/evidence/ingestion';

function doc(overrides: Partial<EvidenceIngestDocumentInput> = {}): EvidenceIngestDocumentInput {
  return {
    movieId: 'movie_1',
    seasonSlug: 'season-2',
    sourceName: 'Criterion',
    url: 'https://criterion.com/essay/eraserhead',
    title: 'Eraserhead and Midnight Cinema',
    content: 'Long-form source text for deterministic chunking and retrieval context.',
    ...overrides,
  };
}

describe('evidence ingestion checkpoint', () => {
  it('skips documents already completed with the same hash', () => {
    const input = doc();
    const checkpoint = markEvidenceDocumentInCheckpoint(createEmptyEvidenceIngestionCheckpoint(), input);

    const result = filterPendingEvidenceDocuments([input], checkpoint);
    expect(result.pending).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('re-processes documents when content hash changes', () => {
    const original = doc();
    const updated = doc({ content: 'Updated long-form source text with new corrections.' });
    const checkpoint = markEvidenceDocumentInCheckpoint(createEmptyEvidenceIngestionCheckpoint(), original);

    const result = filterPendingEvidenceDocuments([updated], checkpoint);
    expect(result.pending).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });
});
