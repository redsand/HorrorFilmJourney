import { describe, expect, it } from 'vitest';
import {
  chunkEvidenceDocument,
  computeEvidenceChunkId,
  type EvidenceIngestDocumentInput,
} from '@/lib/evidence/ingestion/chunking';

function fixture(): EvidenceIngestDocumentInput {
  return {
    movieId: 'movie_1',
    seasonSlug: 'season-2',
    sourceName: 'Criterion',
    url: 'https://criterion.com/essay/eraserhead',
    title: 'Eraserhead and Midnight Cinema',
    content: [
      'Eraserhead became a foundational midnight movie with long-tail repertory screenings.',
      'The film influenced the language of surreal urban dread and transgressive atmosphere.',
      'Its reception grew through grassroots audiences and repertory programming.',
      'Writers repeatedly cite sound design, texture, and industrial staging as defining features.',
    ].join(' '),
    publishedAt: '2026-03-01T00:00:00.000Z',
    license: 'editorial-link-only',
  };
}

describe('evidence chunking', () => {
  it('computes deterministic chunk ids from stable inputs', () => {
    const input = fixture();
    const a = computeEvidenceChunkId({
      sourceName: input.sourceName,
      url: input.url,
      chunkIndex: 0,
      chunkText: 'midnight movie repertory screenings',
    });
    const b = computeEvidenceChunkId({
      sourceName: input.sourceName,
      url: input.url,
      chunkIndex: 0,
      chunkText: 'midnight movie repertory screenings',
    });

    expect(a).toBe(b);
  });

  it('chunks deterministically with configured overlap and max length', () => {
    const input = fixture();
    const a = chunkEvidenceDocument(input, {
      maxChars: 120,
      overlapChars: 24,
    });
    const b = chunkEvidenceDocument(input, {
      maxChars: 120,
      overlapChars: 24,
    });

    expect(a.documentHash).toBe(b.documentHash);
    expect(a.chunks).toEqual(b.chunks);
    expect(a.chunks.length).toBeGreaterThan(1);
    expect(a.chunks.every((chunk) => chunk.text.length <= 120)).toBe(true);
    expect(new Set(a.chunks.map((chunk) => chunk.id)).size).toBe(a.chunks.length);
  });
});

