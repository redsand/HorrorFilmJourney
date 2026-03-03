import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getExternalReadingsForFilm } from '@/lib/companion/external-reading-registry';

describe('external reading guardrails', () => {
  it('enforces local-store-only policy in source (no HTTP client usage)', () => {
    const sourcePath = resolve(process.cwd(), 'src/lib/companion/external-reading-registry.ts');
    const source = readFileSync(sourcePath, 'utf8');

    const forbiddenPatterns = [
      /\bfetch\s*\(/,
      /\baxios\b/,
      /from\s+['"]axios['"]/,
      /from\s+['"]node:http['"]/,
      /from\s+['"]http['"]/,
      /from\s+['"]node:https['"]/,
      /from\s+['"]https['"]/,
      /from\s+['"]undici['"]/,
      /\bXMLHttpRequest\b/,
    ];

    forbiddenPatterns.forEach((pattern) => {
      expect(source).not.toMatch(pattern);
    });
  });

  it('does not make network requests while loading links', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const links = await getExternalReadingsForFilm({
      filmId: '17',
      seasonId: 'season-1',
    });

    expect(Array.isArray(links)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

