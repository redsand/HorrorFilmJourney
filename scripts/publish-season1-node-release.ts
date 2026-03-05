import { PrismaClient } from '@prisma/client';
import { publishSeasonNodeRelease } from '../src/lib/nodes/governance/release-artifact';
import { enforceSnapshotGuardrail } from '../src/lib/audit/snapshot-db-divergence';
import { getReleaseContract } from '../src/lib/nodes/governance/release-contract';

type Cli = {
  taxonomyVersion?: string;
  runId?: string;
};

function parseCli(): Cli {
  const out: Cli = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--taxonomy-version=')) {
      out.taxonomyVersion = arg.split('=')[1]?.trim();
    }
    if (arg.startsWith('--run-id=')) {
      out.runId = arg.split('=')[1]?.trim();
    }
  }
  return out;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const cli = parseCli();
  const contract = getReleaseContract({ seasonSlug: 'season-1', packSlug: 'horror' });
  if (cli.taxonomyVersion && cli.taxonomyVersion !== contract.taxonomyVersion) {
    throw new Error(`Season 1 publishes must use taxonomyVersion ${contract.taxonomyVersion}`);
  }
  const taxonomyVersion = cli.taxonomyVersion ?? contract.taxonomyVersion;

  try {
    const published = await publishSeasonNodeRelease(prisma, {
      seasonSlug: 'season-1',
      packSlug: 'horror',
      taxonomyVersion,
      ...(cli.runId ? { runId: cli.runId } : {}),
    });

    await enforceSnapshotGuardrail(prisma, {
      seasonSlug: 'season-1',
      packSlug: 'horror',
      taxonomyVersion,
      releaseId: published.releaseId,
    });

    console.log(`[season1.publish] published release=${published.releaseId} taxonomyVersion=${published.taxonomyVersion} runId=${published.runId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[season1.publish] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
