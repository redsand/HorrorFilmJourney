import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { computeSnapshotDivergence } from '../src/lib/audit/snapshot-db-divergence';
import { loadSeasonIntegrityRegistry } from '../src/lib/audit/season-integrity-registry';

type Config = {
  seasonSlug: string;
  packSlug: string;
  defaultTaxonomy: string;
};

type DoctorOptions = {
  dryRun: boolean;
  thresholdPercent: number;
};

function parseOptions(): DoctorOptions {
  const args = process.argv.slice(2);
  const thresholdIndex = args.findIndex((arg) => arg === '--threshold-pct');
  const rawThreshold = thresholdIndex >= 0 ? Number(args[thresholdIndex + 1]) : NaN;
  return {
    dryRun: args.includes('--dry-run'),
    thresholdPercent: Number.isFinite(rawThreshold) && rawThreshold >= 0
      ? rawThreshold
      : Number(process.env.SNAPSHOT_DIVERGENCE_THRESHOLD_PCT ?? 2),
  };
}

async function findLatestPublishedRelease(prisma: PrismaClient, packSlug: string): Promise<{ id: string; taxonomyVersion: string } | null> {
  const pack = await prisma.genrePack.findUnique({
    where: { slug: packSlug },
    select: { id: true },
  });
  if (!pack) return null;
  const release = await prisma.seasonNodeRelease.findFirst({
    where: { packId: pack.id, isPublished: true },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, taxonomyVersion: true },
  });
  return release ?? null;
}

function timestampSlug(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

async function runDivergence(prisma: PrismaClient): Promise<{ generatedAt: string; summaries: unknown[] }> {
  const registry = await loadSeasonIntegrityRegistry();
  const configs: Config[] = registry.map((entry) => ({
    seasonSlug: entry.seasonSlug,
    packSlug: entry.packSlug,
    defaultTaxonomy: entry.taxonomyVersion,
  }));
  const summaries = [];
  for (const config of configs) {
    const published = await findLatestPublishedRelease(prisma, config.packSlug);
    const summary = await computeSnapshotDivergence(prisma, {
      seasonSlug: config.seasonSlug,
      packSlug: config.packSlug,
      taxonomyVersion: published?.taxonomyVersion ?? config.defaultTaxonomy,
      releaseId: published?.id,
    });
    summaries.push(summary);
  }
  return {
    generatedAt: new Date().toISOString(),
    summaries,
  };
}

async function main(): Promise<void> {
  const options = parseOptions();
  const now = new Date();
  const reportDir = path.resolve('docs', 'engineering', 'season-doctor', timestampSlug(now));
  const prePath = path.join(reportDir, 'divergence-pre.json');
  const postPath = path.join(reportDir, 'divergence-post.json');
  const repairPath = path.join(reportDir, 'repair-report.json');
  const summaryPath = path.join(reportDir, 'summary.json');
  await fs.mkdir(reportDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const pre = await runDivergence(prisma);
    await fs.writeFile(prePath, JSON.stringify(pre, null, 2), 'utf8');
    const overThreshold = (pre.summaries as Array<{ seasonSlug: string; lossRatePercent: number }>)
      .filter((item) => item.lossRatePercent >= options.thresholdPercent);

    let repairTriggered = false;
    if (overThreshold.length > 0) {
      repairTriggered = true;
      const args = [
        '--experimental-strip-types',
        'scripts/repair-season-dataset.ts',
        '--report-path',
        repairPath,
        '--threshold-pct',
        String(options.thresholdPercent),
      ];
      if (options.dryRun) args.push('--dry-run');
      execFileSync('node', args, { stdio: 'inherit' });
    }

    const post = await runDivergence(prisma);
    await fs.writeFile(postPath, JSON.stringify(post, null, 2), 'utf8');

    const repairReport = repairTriggered
      ? JSON.parse(await fs.readFile(repairPath, 'utf8')) as unknown
      : null;
    const summary = {
      generatedAt: new Date().toISOString(),
      thresholdPercent: options.thresholdPercent,
      dryRun: options.dryRun,
      repairTriggered,
      prePath,
      postPath,
      repairPath: repairTriggered ? repairPath : null,
      repairReport,
    };
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`[seasons-doctor] wrote ${reportDir}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[seasons-doctor] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
