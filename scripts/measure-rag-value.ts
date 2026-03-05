import { prisma } from '../src/lib/prisma.ts';
import { computeRetrievalGateMetricsFromRuns } from '../src/lib/evidence/retrieval/metrics.ts';
import {
  DEFAULT_RETRIEVAL_GATE_THRESHOLDS,
  evaluateRetrievalQualityGates,
} from '../src/lib/evidence/retrieval/quality-gates.ts';
import {
  DEFAULT_RETRIEVAL_VALUE_GOALS_THRESHOLDS,
  evaluateRetrievalValueGoals,
} from '../src/lib/evidence/retrieval/value-goals.ts';

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

function shouldEnforce(): boolean {
  return process.argv.slice(2).includes('--enforce');
}

async function run(): Promise<void> {
  const take = parseTakeArg();
  const enforce = shouldEnforce();

  const [runs, evidenceDocumentCount, evidenceChunkCount] = await Promise.all([
    prisma.retrievalRun.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        selectedCount: true,
        fallbackUsed: true,
        latencyMs: true,
        duplicateRate: true,
        citationValidRate: true,
      },
    }),
    prisma.evidenceDocument.count(),
    prisma.evidenceChunk.count(),
  ]);

  const metrics = computeRetrievalGateMetricsFromRuns(runs);
  const gates = evaluateRetrievalQualityGates(metrics, DEFAULT_RETRIEVAL_GATE_THRESHOLDS);
  const valueGoals = evaluateRetrievalValueGoals({
    gateResult: gates,
    evidenceDocumentCount,
    evidenceChunkCount,
    retrievalRunCount: runs.length,
    thresholds: DEFAULT_RETRIEVAL_VALUE_GOALS_THRESHOLDS,
  });

  const report = {
    pass: valueGoals.pass,
    measuredAt: new Date().toISOString(),
    sample: {
      take,
      retrievalRuns: runs.length,
      evidenceDocuments: evidenceDocumentCount,
      evidenceChunks: evidenceChunkCount,
    },
    gates,
    valueGoals,
  };

  console.log(JSON.stringify(report, null, 2));
  if (enforce && !report.pass) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error('[measure-rag-value] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
