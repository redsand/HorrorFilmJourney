import fs from 'node:fs/promises';
import path from 'node:path';

type FallbackSpec = {
  seasonSlug: 'season-1' | 'season-2';
  packSlug: string;
  tmdbIds: number[];
};

const FALLBACK_FILES: Record<'season-1' | 'season-2', string> = {
  'season-1': path.resolve('docs', 'season', 'season-1-fallback-candidates.json'),
  'season-2': path.resolve('docs', 'season', 'season-2-fallback-candidates.json'),
};

const cache = new Map<string, FallbackSpec | null>();

async function loadSpec(seasonSlug: 'season-1' | 'season-2'): Promise<FallbackSpec | null> {
  if (cache.has(seasonSlug)) {
    return cache.get(seasonSlug) ?? null;
  }
  const filePath = FALLBACK_FILES[seasonSlug];
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as FallbackSpec;
    cache.set(seasonSlug, parsed);
    return parsed;
  } catch {
    cache.set(seasonSlug, null);
    return null;
  }
}

export async function loadFallbackTmdbIds(
  seasonSlug: string | undefined,
  packSlug: string | undefined,
): Promise<number[]> {
  if (seasonSlug !== 'season-1' && seasonSlug !== 'season-2') {
    return [];
  }
  if (!packSlug) {
    return [];
  }
  const spec = await loadSpec(seasonSlug);
  if (!spec || spec.packSlug !== packSlug) {
    return [];
  }
  return spec.tmdbIds;
}
