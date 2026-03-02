import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';

type Context = {
  params: {
    batchId: string;
  };
};

export async function GET(request: Request, context: Context): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const diagnostics = await prisma.recommendationDiagnostics.findUnique({
    where: { batchId: context.params.batchId },
    select: {
      batchId: true,
      candidateCount: true,
      excludedSeenCount: true,
      excludedSkippedRecentCount: true,
      explorationUsed: true,
      diversityStats: true,
      createdAt: true,
    },
  });

  if (!diagnostics) {
    return fail({ code: 'NOT_FOUND', message: 'Recommendation diagnostics not found' }, 404);
  }

  return ok(diagnostics, { status: 200 });
}
