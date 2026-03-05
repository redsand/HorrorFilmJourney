import { prisma } from '../src/lib/prisma';
import { refreshEvidenceIndex } from '../src/lib/evidence/ingestion/index';

function parseArgs(): { batchSize?: number; maxRounds?: number } {
  const args = process.argv.slice(2);
  const batchIdx = args.findIndex((arg) => arg === '--batchSize');
  const roundsIdx = args.findIndex((arg) => arg === '--maxRounds');
  const batchRaw = batchIdx >= 0 ? args[batchIdx + 1] : undefined;
  const roundsRaw = roundsIdx >= 0 ? args[roundsIdx + 1] : undefined;
  const batchSize = batchRaw ? Number.parseInt(batchRaw, 10) : undefined;
  const maxRounds = roundsRaw ? Number.parseInt(roundsRaw, 10) : undefined;
  return {
    ...(Number.isInteger(batchSize) && (batchSize ?? 0) > 0 ? { batchSize } : {}),
    ...(Number.isInteger(maxRounds) && (maxRounds ?? 0) > 0 ? { maxRounds } : {}),
  };
}

async function run(): Promise<void> {
  const options = parseArgs();
  const result = await refreshEvidenceIndex(prisma, options);
  console.log(JSON.stringify({
    ok: result.complete,
    options,
    rounds: result.rounds,
    scanned: result.scanned,
    updated: result.updated,
    complete: result.complete,
  }, null, 2));
  if (!result.complete) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error('[refresh-evidence-index] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
