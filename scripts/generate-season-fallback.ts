import fs from 'node:fs/promises';
import path from 'node:path';

const SEASON1_SNAPSHOT = path.resolve('backups', 'season1-horror-snapshot-2026-03-04T19-19-00-138Z.json');
const SEASON2_MASTERED = path.resolve('docs', 'season', 'season-2-cult-classics-mastered.json');
const SEASON1_OUTPUT = path.resolve('docs', 'season', 'season-1-fallback-candidates.json');
const SEASON2_OUTPUT = path.resolve('docs', 'season', 'season-2-fallback-candidates.json');

async function buildSeason1Fallback(): Promise<number[]> {
  const raw = await fs.readFile(SEASON1_SNAPSHOT, 'utf8');
  const parsed = JSON.parse(raw) as { assignments: Array<{ tmdbId?: number }> };
  const ids = new Set<number>();
  for (const assignment of parsed.assignments ?? []) {
    if (ids.size >= 80) {
      break;
    }
    if (Number.isInteger(assignment.tmdbId)) {
      ids.add(assignment.tmdbId!);
    }
  }
  return Array.from(ids);
}

async function buildSeason2Fallback(): Promise<number[]> {
  const raw = await fs.readFile(SEASON2_MASTERED, 'utf8');
  const parsed = JSON.parse(raw) as {
    nodes: Array<{ core?: Array<{ tmdbId?: number }>; extended?: Array<{ tmdbId?: number }> }>;
  };
  const ids = new Set<number>();
  for (const node of parsed.nodes ?? []) {
    for (const entry of [...(node.core ?? []), ...(node.extended ?? [])]) {
      if (ids.size >= 80) {
        break;
      }
      if (Number.isInteger(entry.tmdbId)) {
        ids.add(entry.tmdbId!);
      }
    }
    if (ids.size >= 80) {
      break;
    }
  }
  return Array.from(ids);
}

async function main(): Promise<void> {
  const season1Ids = await buildSeason1Fallback();
  const season2Ids = await buildSeason2Fallback();
  await fs.mkdir(path.dirname(SEASON1_OUTPUT), { recursive: true });
  await fs.mkdir(path.dirname(SEASON2_OUTPUT), { recursive: true });
  await fs.writeFile(SEASON1_OUTPUT, JSON.stringify({
    seasonSlug: 'season-1',
    packSlug: 'horror',
    tmdbIds: season1Ids,
  }, null, 2), 'utf8');
  await fs.writeFile(SEASON2_OUTPUT, JSON.stringify({
    seasonSlug: 'season-2',
    packSlug: 'cult-classics',
    tmdbIds: season2Ids,
  }, null, 2), 'utf8');
  console.log('Season fallback candidates generated');
}

main().catch((error) => {
  console.error('[generate-season-fallback] failed', error);
  process.exit(1);
});
