import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { prisma } from '../src/lib/prisma';
import { computeRetrievalGateMetricsFromRuns } from '../src/lib/evidence/retrieval/metrics';
import {
  DEFAULT_RETRIEVAL_GATE_THRESHOLDS,
  evaluateRetrievalQualityGates,
} from '../src/lib/evidence/retrieval/quality-gates';
import {
  DEFAULT_RETRIEVAL_VALUE_GOALS_THRESHOLDS,
  evaluateRetrievalValueGoals,
} from '../src/lib/evidence/retrieval/value-goals';
import { evaluateRetrievalRolloutReadiness } from '../src/lib/evidence/retrieval/rollout-readiness';
import { findUncheckedChecklistItems } from '../src/lib/evidence/retrieval/tracker-checklist';
import { buildRetrievalCompletionReport } from '../src/lib/evidence/retrieval/completion-report';

function parseArgs(): { take: number; output: string; enforce: boolean } {
  const args = process.argv.slice(2);
  const takeIdx = args.findIndex((arg) => arg === '--take');
  const outputIdx = args.findIndex((arg) => arg === '--output');
  const takeRaw = takeIdx >= 0 ? args[takeIdx + 1] : undefined;
  const outputRaw = outputIdx >= 0 ? args[outputIdx + 1] : undefined;
  const parsedTake = takeRaw ? Number.parseInt(takeRaw, 10) : 300;
  return {
    take: Number.isInteger(parsedTake) && parsedTake > 0 ? Math.min(parsedTake, 5000) : 300,
    output: resolve(process.cwd(), outputRaw ?? 'artifacts/rag-completion-report.json'),
    enforce: args.includes('--enforce'),
  };
}

async function run(): Promise<void> {
  const { take, output, enforce } = parseArgs();
  const trackerMarkdown = readFileSync(resolve(process.cwd(), 'docs/full-retrieval-pipeline-tracker.md'), 'utf8');
  const trackerIssues = findUncheckedChecklistItems(trackerMarkdown);

  const [runs, evidenceDocumentCount, evidenceChunkCount] = await Promise.all([
    prisma.retrievalRun.findMany({
      where: { mode: { in: ['hybrid', 'shadow'] } },
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
  const rollout = evaluateRetrievalRolloutReadiness({
    runCount: runs.length,
    metrics,
  });

  const report = buildRetrievalCompletionReport({
    measuredAt: new Date().toISOString(),
    trackerUncheckedCount: trackerIssues.length,
    retrievalRunCount: runs.length,
    gates,
    valueGoals,
    rollout,
  });

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    ok: report.pass,
    output,
    trackerUncheckedCount: trackerIssues.length,
    retrievalRunCount: runs.length,
  }, null, 2));
  if (enforce && !report.pass) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error('[generate-rag-completion-report] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
