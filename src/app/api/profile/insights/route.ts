import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { ThematicInsightService } from '@/lib/taste/thematic-insight-service';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const service = new ThematicInsightService(prisma);
  const result = await service.getInsights(auth.userId);
  return ok(result, { status: 200 });
}
