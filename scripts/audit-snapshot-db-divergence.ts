import { PrismaClient } from '@prisma/client';
import { computeSnapshotDivergence } from '../src/lib/audit/snapshot-db-divergence.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSeasonIntegrityRegistry } from '../src/lib/audit/season-integrity-registry.ts';

const REPORT_PATH = path.resolve('docs', 'engineering', 'snapshot-db-divergence.json');

async function findLatestPublishedRelease(prisma: PrismaClient, packSlug: string): Promise<{ id: string; taxonomyVersion: string } | null> {
  const pack = await prisma.genrePack.findUnique({
    where: { slug: packSlug },
    select: { id: true },
  });
  if (!pack) {
    return null;
  }
  const release = await prisma.seasonNodeRelease.findFirst({
    where: { packId: pack.id, isPublished: true },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, taxonomyVersion: true },
  });
  return release ?? null;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const configurations = (await loadSeasonIntegrityRegistry()).map((entry) => ({
      seasonSlug: entry.seasonSlug,
      packSlug: entry.packSlug,
      defaultTaxonomy: entry.taxonomyVersion,
    }));
    const summaries = [];
    for (const config of configurations) {
      const published = await findLatestPublishedRelease(prisma, config.packSlug);
      const summary = await computeSnapshotDivergence(prisma, {
        seasonSlug: config.seasonSlug,
        packSlug: config.packSlug,
        taxonomyVersion: published?.taxonomyVersion ?? config.defaultTaxonomy,
        releaseId: published?.id,
      });
      summaries.push(summary);
    }
    const report = {
      generatedAt: new Date().toISOString(),
      summaries,
    };
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[audit-snapshot-db-divergence] wrote ${REPORT_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[audit-snapshot-db-divergence] failed', error);
  process.exit(1);
});
