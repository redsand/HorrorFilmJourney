import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findUncheckedChecklistItems } from '../src/lib/evidence/retrieval/tracker-checklist.ts';

function parseTrackerPath(): string {
  const args = process.argv.slice(2);
  const idx = args.findIndex((arg) => arg === '--file');
  const raw = idx >= 0 ? args[idx + 1] : 'docs/full-retrieval-pipeline-tracker.md';
  return resolve(process.cwd(), raw);
}

function run(): void {
  const trackerPath = parseTrackerPath();
  const markdown = readFileSync(trackerPath, 'utf8');
  const issues = findUncheckedChecklistItems(markdown);

  const report = {
    ok: issues.length === 0,
    trackerPath,
    uncheckedCount: issues.length,
    unchecked: issues,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

try {
  run();
} catch (error) {
  console.error('[check-retrieval-tracker-checklist] failed', error);
  process.exitCode = 1;
}
