import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/audit/audit';

const updatePackSchema = z.object({
  isEnabled: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: { id: string } },
): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = updatePackSchema.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: 'isEnabled is required' }, 400);
  }

  const pack = await prisma.genrePack.findUnique({
    where: { id: context.params.id },
    select: {
      id: true,
      slug: true,
      seasonId: true,
      isEnabled: true,
      season: { select: { isActive: true } },
    },
  });
  if (!pack) {
    return fail({ code: 'NOT_FOUND', message: 'Pack not found' }, 404);
  }

  if (!parsed.data.isEnabled && pack.season.isActive) {
    const enabledCount = await prisma.genrePack.count({
      where: { seasonId: pack.seasonId, isEnabled: true },
    });
    if (enabledCount <= 1) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Cannot disable the last enabled pack in the active season' }, 400);
    }
  }

  const updated = await prisma.genrePack.update({
    where: { id: pack.id },
    data: { isEnabled: parsed.data.isEnabled },
    select: { id: true, slug: true, isEnabled: true },
  });

  await logAuditEvent(prisma, {
    adminUserId: auth.userId,
    action: parsed.data.isEnabled ? 'ADMIN_PACK_ENABLE' : 'ADMIN_PACK_DISABLE',
    targetId: updated.id,
    metadata: { slug: updated.slug },
  });

  return ok({ pack: updated });
}
