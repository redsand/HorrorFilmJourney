import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { getExperience } from '@/lib/experience-state';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/request-context';

export async function GET(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { userId, error } = await getCurrentUserId(request, prisma);
  if (error || !userId) {
    return fail(error ?? { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' }, 400);
  }

  const experience = await getExperience(userId, prisma);
  return ok(experience, { status: 200 });
}
