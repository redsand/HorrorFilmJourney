import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';
import { getCurrentUserId } from '@/lib/request-context';
import { toMovieCardVM } from '@/adapters/toMovieCardVM';

export async function POST(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { userId, error } = await getCurrentUserId(request, prisma);
  if (error || !userId) {
    return fail(error ?? { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' }, 400);
  }

  const result = await generateRecommendationBatch(userId, prisma);
  const cards = toMovieCardVM(result);

  return ok(
    {
      batchId: result.batchId,
      cards,
    },
    { status: 200 },
  );
}
