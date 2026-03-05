import { prisma } from '@/lib/prisma';
import { backfillEvidenceChunkEmbeddings } from '@/lib/evidence/ingestion';

function parseArgs(): { batchSize?: number; force: boolean } {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const batchFlag = args.findIndex((arg) => arg === '--batchSize');
  const batchRaw = batchFlag >= 0 ? args[batchFlag + 1] : undefined;
  const batchSize = batchRaw ? Number.parseInt(batchRaw, 10) : undefined;
  return {
    ...(Number.isInteger(batchSize) && (batchSize ?? 0) > 0 ? { batchSize } : {}),
    force,
  };
}

async function run(): Promise<void> {
  const options = parseArgs();
  const result = await backfillEvidenceChunkEmbeddings(prisma, options);
  console.log(JSON.stringify({
    ok: true,
    options,
    scanned: result.scanned,
    updated: result.updated,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('[backfill-evidence-chunk-embeddings] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

