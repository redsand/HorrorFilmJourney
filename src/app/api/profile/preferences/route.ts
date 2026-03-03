import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { seasonsPacksEnabled } from '@/lib/feature-flags';
import { listAvailablePacks, resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { DEFAULT_PACK_SLUG } from '@/lib/packs/constants';

const preferenceSchema = z.object({
  recommendationStyle: z.enum(['diversity', 'popularity']).optional(),
  selectedPackSlug: z.string().trim().min(1).optional(),
}).refine((value) => value.recommendationStyle !== undefined || value.selectedPackSlug !== undefined, {
  message: 'At least one preference field is required',
});

function resolveRecommendationStyle(horrorDNA: unknown): 'diversity' | 'popularity' {
  if (!horrorDNA || typeof horrorDNA !== 'object') {
    return 'diversity';
  }
  const style = (horrorDNA as Record<string, unknown>).recommendationStyle;
  return style === 'popularity' ? 'popularity' : 'diversity';
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      horrorDNA: true,
      tolerance: true,
      pacePreference: true,
    },
  });

  const effectivePack = seasonsPacksEnabled()
    ? await resolveEffectivePackForUser(prisma, auth.userId)
    : null;

  return ok({
    recommendationStyle: resolveRecommendationStyle(profile?.horrorDNA),
    tolerance: profile?.tolerance ?? 3,
    pacePreference: profile?.pacePreference ?? 'balanced',
    ...(effectivePack ? { selectedPackSlug: effectivePack.packSlug } : {}),
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = preferenceSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid preference payload',
      },
      400,
    );
  }

  const existing = await prisma.userProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      tolerance: true,
      pacePreference: true,
      horrorDNA: true,
    },
  });
  const nextHorrorDna = {
    ...(existing?.horrorDNA && typeof existing.horrorDNA === 'object'
      ? existing.horrorDNA as Record<string, unknown>
      : {}),
    ...(parsed.data.recommendationStyle ? { recommendationStyle: parsed.data.recommendationStyle } : {}),
  };

  let selectedPackId: string | undefined;
  if (seasonsPacksEnabled()) {
    const requested = (parsed.data.selectedPackSlug ?? DEFAULT_PACK_SLUG).toLowerCase();
    const available = await listAvailablePacks(prisma);
    const selected = available.packs.find((pack) => pack.slug === requested && pack.isEnabled);
    const packSlug = selected?.slug ?? DEFAULT_PACK_SLUG;
    const pack = await prisma.genrePack.findUnique({
      where: { slug: packSlug },
      select: { id: true },
    });
    if (pack) {
      selectedPackId = pack.id;
    }
  }

  await prisma.userProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      onboardingCompleted: true,
      tolerance: existing?.tolerance ?? 3,
      pacePreference: existing?.pacePreference ?? 'balanced',
      horrorDNA: nextHorrorDna,
      ...(selectedPackId ? { selectedPackId } : {}),
    },
    update: {
      horrorDNA: nextHorrorDna,
      ...(selectedPackId ? { selectedPackId } : {}),
    },
  });

  return ok({ success: true });
}
