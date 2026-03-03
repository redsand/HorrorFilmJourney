import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { ThematicInsightService } from '@/lib/taste/thematic-insight-service';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const service = new ThematicInsightService(prisma);
  const effectivePack = await resolveEffectivePackForUser(prisma, auth.userId);
  const result = await service.getInsights(auth.userId, { packId: effectivePack.packId });
  return ok(result, { status: 200 });
}
