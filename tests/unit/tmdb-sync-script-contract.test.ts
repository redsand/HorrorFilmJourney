import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function load(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('TMDB sync script contract', () => {
  it('full sync fetches credits and persists director/cast', () => {
    const source = load('scripts/sync-tmdb-catalog.ts');
    expect(source).toContain("append_to_response', 'keywords,credits'");
    expect(source).toContain('director: parseDirector');
    expect(source).toContain('castTop: parseCastTop');
  });

  it('incremental sync fetches credits and persists director/cast', () => {
    const source = load('scripts/sync-tmdb-catalog-update.ts');
    expect(source).toContain('append_to_response=keywords,credits');
    expect(source).toContain('director: parseDirector');
    expect(source).toContain('castTop: parseCastTop');
  });
});
