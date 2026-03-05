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
    expect(source).toContain('incomingDirector: parseDirector');
    expect(source).toContain('incomingCastTop: parseCastTop');
    expect(source).toContain('director: mergedCredits.director');
    expect(source).toContain('castTop: mergedCredits.castTop');
  });

  it('incremental sync fetches credits and persists director/cast', () => {
    const source = load('scripts/sync-tmdb-catalog-update.ts');
    expect(source).toContain('append_to_response=keywords,credits');
    expect(source).toContain('incomingDirector: parseDirector');
    expect(source).toContain('incomingCastTop: parseCastTop');
    expect(source).toContain('director: mergedCredits.director');
    expect(source).toContain('castTop: mergedCredits.castTop');
  });
});
