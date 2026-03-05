import { describe, expect, it } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const LEGACY_SEASON2_SLUGS = [
  'birth-of-midnight',
  'so-bad-its-good',
  'cult-sci-fi-fantasy',
  'punk-counterculture',
  'vhs-video-store-era',
  'cult-comedy-absurdism',
];

const ROOT_DIRECTORIES = [
  'src',
  'docs',
  'prisma',
  'scripts',
  'tests',
  'resources',
];

const IGNORED_DIRECTORIES = new Set(['node_modules', '.next', 'backups', 'artifacts', '.git']);

const EXCLUDED_RELATIVE_PATHS = new Set([
  'docs/engineering/slug-taxonomy-audit.md',
  'tests/unit/season-2-slug-guard.test.ts',
]);

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      files.push(...await collectFiles(join(directory, entry.name)));
      continue;
    }
    files.push(join(directory, entry.name));
  }
  return files;
}

async function readText(filePath: string): Promise<string | null> {
  const ignoredExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.zip', '.tar', '.gz']);
  if (ignoredExtensions.has(extname(filePath))) {
    return null;
  }
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

describe('Season 2 legacy slug guard', () => {
  it('fails when legacy Season 2 slugs reappear', async () => {
    const allFiles = await collectFiles(process.cwd());
    const candidates = allFiles.filter((filePath) => {
    const relativePath = relative(process.cwd(), filePath).replace(/\\/g, '/');
    if (!relativePath || relativePath.startsWith('..')) {
      return false;
    }
    if (EXCLUDED_RELATIVE_PATHS.has(relativePath)) {
      return false;
    }
    const firstSegment = relativePath.split(/[\\/]/, 1)[0];
    return ROOT_DIRECTORIES.includes(firstSegment);
  });
    const returnEntries: Array<{ file: string; slug: string }> = [];
    for (const filePath of candidates) {
      const text = await readText(filePath);
      if (!text) {
        continue;
      }
      for (const slug of LEGACY_SEASON2_SLUGS) {
        if (text.includes(slug)) {
        returnEntries.push({ file: relative(process.cwd(), filePath).replace(/\\/g, '/'), slug });
      }
    }
  }

    expect(returnEntries).toEqual([]);
  });
});
