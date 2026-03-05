import { prisma } from '../src/lib/prisma';
import { computeRetrievalGateMetricsFromRuns } from '../src/lib/evidence/retrieval/metrics';
import { evaluateRetrievalRolloutReadiness } from '../src/lib/evidence/retrieval/rollout-readiness';

function parseTakeArg(): number {
  const args = process.argv.slice(2);
  const idx = args.findIndex((arg) => arg === '--take');
  const raw = idx >= 0 ? args[idx + 1] : undefined;
  const parsed = raw ? Number.parseInt(raw, 10) : 500;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 500;
  }
  return Math.min(parsed, 5000);
}

async function run(): Promise<void> {
  const take = parseTakeArg();
  const runs = await prisma.retrievalRun.findMany({
    where: {
      mode: { in: ['hybrid', 'shadow'] },
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      selectedCount: true,
      fallbackUsed: true,
      latencyMs: true,
      duplicateRate: true,
      citationValidRate: true,
    },
  });

  const metrics = computeRetrievalGateMetricsFromRuns(runs);
  const readiness = evaluateRetrievalRolloutReadiness({
    runCount: runs.length,
    metrics,
  });

  console.log(JSON.stringify({
    pass: readiness.pass,
    sample: {
      take,
      runCount: runs.length,
      modes: ['hybrid', 'shadow'],
    },
    metrics,
    readiness,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('[assess-retrieval-rollout] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
