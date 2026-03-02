import { fail, ok } from '@/lib/api-envelope';
import { getExperience } from '@/lib/experience-state';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const experience = await getExperience(auth.userId, prisma);
  return ok(experience, { status: 200 });
}
