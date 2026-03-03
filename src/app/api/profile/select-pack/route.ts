import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';

const selectPackSchema = z.object({
  packSlug: z.string().trim().min(1).optional(),
  packId: z.string().trim().min(1).optional(),
}).refine((value) => Boolean(value.packSlug) || Boolean(value.packId), {
  message: 'packSlug or packId is required',
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = selectPackSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid pack selection payload' },
      400,
    );
  }

  const payload = parsed.data;
  const pack = await prisma.genrePack.findFirst({
    where: {
      isEnabled: true,
      ...(payload.packId ? { id: payload.packId } : { slug: payload.packSlug?.toLowerCase() }),
    },
    select: { id: true, slug: true, season: { select: { slug: true } } },
  });

  if (!pack) {
    return fail({ code: 'VALIDATION_ERROR', message: 'Selected pack is unavailable' }, 400);
  }

  await prisma.userProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      onboardingCompleted: false,
      tolerance: 3,
      pacePreference: 'balanced',
      selectedPackId: pack.id,
      horrorDNA: { recommendationStyle: 'diversity' },
    },
    update: {
      selectedPackId: pack.id,
    },
  });

  return ok({
    success: true,
    pack: {
      id: pack.id,
      slug: pack.slug,
      seasonSlug: pack.season.slug,
    },
  });
}
