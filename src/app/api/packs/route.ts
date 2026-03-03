import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { listAvailablePacks } from '@/lib/packs/pack-resolver';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const payload = await listAvailablePacks(prisma);
  return ok(payload);
}
