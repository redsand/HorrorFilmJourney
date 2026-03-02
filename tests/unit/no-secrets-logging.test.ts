import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'tests', 'scripts', 'docs'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.md']);

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkFiles(full));
      continue;
    }

    const ext = full.slice(full.lastIndexOf('.'));
    if (CODE_EXTENSIONS.has(ext)) {
      files.push(full);
    }
  }

  return files;
}

describe('secret logging guard', () => {
  it('does not log process.env or sensitive token keys', () => {
    const offenders: string[] = [];
    const filePaths = ROOTS.flatMap((root) => (existsSync(root) ? walkFiles(root) : []));

    const patterns = [
      /console\.(log|info|debug)\s*\(\s*process\.env/gi,
      /console\.(log|info|debug)\s*\([^)]*(ADMIN_TOKEN|DATABASE_URL|API_KEY|SECRET)/gi,
    ];

    for (const path of filePaths) {
      const content = readFileSync(path, 'utf-8');
      if (patterns.some((pattern) => pattern.test(content))) {
        offenders.push(path);
      }
    }

    expect(offenders).toEqual([]);
  });
});
