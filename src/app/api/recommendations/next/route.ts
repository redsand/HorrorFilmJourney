import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { generateRecommendationBatchV1 } from '@/lib/recommendation/recommendation-engine-v1';
import { getCurrentUserId } from '@/lib/request-context';

export async function POST(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { userId, error } = await getCurrentUserId(request, prisma);
  if (error || !userId) {
    return fail(error ?? { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' }, 400);
  }

  const result = await generateRecommendationBatchV1(userId, prisma);
  return ok(result, { status: 200 });
}
