import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/audit/audit';

const setActiveSeasonSchema = z.object({
  seasonId: z.string().trim().min(1).optional(),
  seasonSlug: z.string().trim().min(1).optional(),
}).refine((value) => Boolean(value.seasonId) || Boolean(value.seasonSlug), {
  message: 'seasonId or seasonSlug is required',
});

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const seasons = await prisma.season.findMany({
    orderBy: [{ isActive: 'desc' }, { slug: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      packs: {
        orderBy: { slug: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          isEnabled: true,
          primaryGenre: true,
          description: true,
        },
      },
    },
  });

  return ok({
    activeSeason: seasons.find((season) => season.isActive) ?? null,
    seasons,
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = setActiveSeasonSchema.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' }, 400);
  }

  const season = await prisma.season.findFirst({
    where: parsed.data.seasonId
      ? { id: parsed.data.seasonId }
      : { slug: parsed.data.seasonSlug?.toLowerCase() },
    select: { id: true, slug: true },
  });
  if (!season) {
    return fail({ code: 'NOT_FOUND', message: 'Season not found' }, 404);
  }

  await prisma.$transaction([
    prisma.season.updateMany({ data: { isActive: false } }),
    prisma.season.update({ where: { id: season.id }, data: { isActive: true } }),
  ]);

  await logAuditEvent(prisma, {
    adminUserId: auth.userId,
    action: 'ADMIN_SEASON_ACTIVATE',
    targetId: season.id,
    metadata: { seasonSlug: season.slug },
  });

  return ok({ success: true, activeSeason: season });
}
