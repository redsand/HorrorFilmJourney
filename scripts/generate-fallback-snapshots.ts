import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { computeFallbackSnapshot, getFallbackContracts } from '../src/lib/recommendation/fallback-snapshot';

async function writeSnapshot(snapshot: { seasonSlug: string; packSlug: string; tmdbIds: number[] }): Promise<void> {
  const filePath = path.resolve('docs', 'season', `${snapshot.seasonSlug}-fallback-candidates.json`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  console.log(`[fallback] wrote ${path.relative(process.cwd(), filePath)} (${snapshot.tmdbIds.length} movies)`);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    for (const contract of getFallbackContracts()) {
      const snapshot = await computeFallbackSnapshot(prisma, contract);
      await writeSnapshot(snapshot);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[generate-fallback-snapshots] failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
