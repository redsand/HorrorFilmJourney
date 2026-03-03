import { describe, expect, it } from 'vitest';
import { zExternalReading } from '@/lib/contracts/companion-contract';

describe('companion external reading contract', () => {
  it('accepts valid season-scoped external reading', () => {
    const parsed = zExternalReading.safeParse({
      sourceName: 'RogerEbert.com',
      articleTitle: 'A retrospective on cult horror aesthetics',
      url: 'https://www.rogerebert.com/features/example',
      seasonId: 'season-1',
      publicationDate: '2026-03-03T00:00:00.000Z',
      sourceType: 'retrospective',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects non-absolute URLs', () => {
    const parsed = zExternalReading.safeParse({
      sourceName: 'Example',
      articleTitle: 'Local path is invalid',
      url: '/relative/path',
      seasonId: 'season-1',
      sourceType: 'essay',
    });

    expect(parsed.success).toBe(false);
  });
});

