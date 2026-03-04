import { PrismaClient } from '@prisma/client';
import { publishSeasonNodeRelease } from '../src/lib/nodes/governance/release-artifact.ts';

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

  try {
    const published = await publishSeasonNodeRelease(prisma, {
      seasonSlug: 'season-1',
      packSlug: 'horror',
      ...(cli.taxonomyVersion ? { taxonomyVersion: cli.taxonomyVersion } : {}),
      ...(cli.runId ? { runId: cli.runId } : {}),
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
