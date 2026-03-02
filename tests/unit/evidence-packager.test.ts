import { describe, expect, it } from 'vitest';
import {
  MAX_EVIDENCE_PACKETS_PER_MOVIE,
  MAX_EVIDENCE_SNIPPET_LENGTH,
  packageEvidencePackets,
  sanitizeEvidenceSnippet,
} from '@/lib/evidence/evidence-packager';

describe('evidence packager', () => {
  it('sanitizes HTML and normalizes whitespace', () => {
    const result = sanitizeEvidenceSnippet(' <p>Hello <b>World</b></p>\n<div>  line 2 </div> ');
    expect(result).toBe('Hello World line 2');
  });

  it('caps snippet length and limits packets', () => {
    const long = `x${'a'.repeat(MAX_EVIDENCE_SNIPPET_LENGTH + 100)}`;
    const packets = Array.from({ length: MAX_EVIDENCE_PACKETS_PER_MOVIE + 3 }).map((_, idx) => ({
      sourceName: `S${idx}`,
      snippet: long,
      retrievedAt: '2026-01-01T00:00:00.000Z',
    }));

    const result = packageEvidencePackets(packets);
    expect(result).toHaveLength(MAX_EVIDENCE_PACKETS_PER_MOVIE);
    expect(result[0]!.snippet.length).toBeLessThanOrEqual(MAX_EVIDENCE_SNIPPET_LENGTH);
  });
});
