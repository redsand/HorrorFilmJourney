import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { JourneyProgressionService } from '@/lib/journey/journey-progression-service';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const service = new JourneyProgressionService(prisma);
  const progression = await service.getProfileProgress(auth.userId);

  return ok(progression, { status: 200 });
}
