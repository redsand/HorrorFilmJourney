import { prisma } from '@/lib/prisma';
import { computeRetrievalGateMetricsFromRuns } from '@/lib/evidence/retrieval/metrics';
import {
  DEFAULT_RETRIEVAL_GATE_THRESHOLDS,
  evaluateRetrievalQualityGates,
} from '@/lib/evidence/retrieval/quality-gates';

function parseTakeArg(): number {
  const args = process.argv.slice(2);
  const idx = args.findIndex((arg) => arg === '--take');
  const raw = idx >= 0 ? args[idx + 1] : undefined;
  const parsed = raw ? Number.parseInt(raw, 10) : 300;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 300;
  }
  return Math.min(parsed, 5000);
}

async function run(): Promise<void> {
  const take = parseTakeArg();
  const runs = await prisma.retrievalRun.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      selectedCount: true,
      fallbackUsed: true,
      latencyMs: true,
    },
  });

  const metrics = computeRetrievalGateMetricsFromRuns(runs);
  const report = evaluateRetrievalQualityGates(metrics, DEFAULT_RETRIEVAL_GATE_THRESHOLDS);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error('[check-retrieval-gates] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

