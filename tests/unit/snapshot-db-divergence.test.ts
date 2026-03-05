import { describe, expect, it } from 'vitest';
import { classifyMissingReason, shouldFailPublish } from '@/lib/audit/snapshot-db-divergence';

describe('snapshot divergence helpers', () => {
  it('classifies missing poster', () => {
    expect(classifyMissingReason({ posterUrl: '', castTop: ['A'], ratings: [{ source: 'TMDB', value: 5 }] })).toBe('eligibility-gate:poster');
  });

  it('classifies missing credits', () => {
    expect(classifyMissingReason({ posterUrl: 'url', castTop: [], ratings: [{ source: 'TMDB', value: 5 }] })).toBe('eligibility-gate:credits');
  });

  it('classifies missing votes', () => {
    expect(classifyMissingReason({ posterUrl: 'url', castTop: ['A'], ratings: [] })).toBe('eligibility-gate:votes');
  });

  it('classifies unresolved tmdb when movie missing', () => {
    expect(classifyMissingReason(null)).toBe('unresolved-tmdb');
  });

  it('falls back to importer-schema when metadata is present', () => {
    expect(classifyMissingReason({ posterUrl: 'url', castTop: ['A'], ratings: [{ source: 'TMDB', value: 7 }] })).toBe('importer-schema');
  });

  it('blocks publish when loss rate exceeds threshold without override', () => {
    expect(shouldFailPublish(5, 2, false)).toBe(true);
  });

  it('allows publish when loss rate below threshold', () => {
    expect(shouldFailPublish(1, 2, false)).toBe(false);
  });

  it('allows publish when override is set', () => {
    expect(shouldFailPublish(10, 2, true)).toBe(false);
  });
});
