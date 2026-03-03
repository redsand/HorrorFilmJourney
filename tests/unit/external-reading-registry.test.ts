import { describe, expect, it } from 'vitest';
import { getExternalReadingsForFilm } from '@/lib/companion/external-reading-registry';

describe('external reading registry loader', () => {
  it('returns Bloody Disgusting link for known Season 1 film entry', async () => {
    const links = await getExternalReadingsForFilm({
      filmId: '17',
      seasonId: 'season-1',
    });

    expect(links.length).toBeGreaterThan(0);
    expect(links.some((link) => link.sourceName.toLowerCase().includes('bloody'))).toBe(true);
    expect(links.every((link) => link.seasonId === 'season-1')).toBe(true);
  });

  it('returns empty array when film has no registry entries', async () => {
    const links = await getExternalReadingsForFilm({
      filmId: '9999999',
      seasonId: 'season-1',
    });

    expect(links).toEqual([]);
  });

  it('rejects links that do not match allowed domains for the season', async () => {
    const links = await getExternalReadingsForFilm({
      filmId: '17',
      seasonId: 'season-1',
      registry: [
        {
          filmId: '17',
          seasonId: 'season-1',
          links: [
            {
              sourceName: 'Untrusted',
              articleTitle: 'Bad Domain',
              url: 'https://evil.example.com/something',
              seasonId: 'season-1',
              sourceType: 'essay',
            },
          ],
        },
      ],
    });

    expect(links).toEqual([]);
  });
});

