import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { evaluateRetrievalQualityGates } from '@/lib/evidence/retrieval/quality-gates';
import { computeRetrievalGateMetricsFromRuns } from '@/lib/evidence/retrieval/metrics';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const runs = await prisma.retrievalRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      movieId: true,
      mode: true,
      fallbackUsed: true,
      fallbackReason: true,
      seasonSlug: true,
      packId: true,
      queryText: true,
      candidateCount: true,
      selectedCount: true,
      latencyMs: true,
      createdAt: true,
    },
  });

  const gates = evaluateRetrievalQualityGates(computeRetrievalGateMetricsFromRuns(runs));

  return ok({ runs, gates });
}
