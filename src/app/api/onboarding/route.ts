import { Prisma } from '@prisma/client';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { z } from 'zod';
import { seasonsPacksEnabled } from '@/lib/feature-flags';
import { DEFAULT_PACK_SLUG } from '@/lib/packs/constants';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { getPackSubgenreOptions, MAX_SELECTED_SUBGENRES, normalizeSubgenreValue } from '@/lib/packs/subgenres';

const onboardingSchema = z.object({
  tolerance: z.number().int().min(1).max(5),
  pacePreference: z.enum(['slowburn', 'balanced', 'shock']),
  selectedPackSlug: z.string().trim().min(1).optional(),
  selectedSubgenres: z.array(z.string().trim().min(1).max(32)).max(MAX_SELECTED_SUBGENRES).optional(),
  horrorDNA: z.unknown().optional(),
});

function ensureDefaultRecommendationStyle(horrorDNA: unknown): Record<string, unknown> {
  const base = horrorDNA && typeof horrorDNA === 'object' ? horrorDNA as Record<string, unknown> : {};
  if (base.recommendationStyle === 'diversity' || base.recommendationStyle === 'popularity') {
    return base;
  }
  return {
    ...base,
    recommendationStyle: 'diversity',
  };
}

function applyPackSubgenres(
  horrorDNA: Record<string, unknown>,
  packId: string | undefined,
  selectedSubgenres: string[],
): Record<string, unknown> {
  if (!packId || selectedSubgenres.length === 0) {
    return horrorDNA;
  }
  const basePackPreferences = horrorDNA.packPreferences && typeof horrorDNA.packPreferences === 'object'
    ? horrorDNA.packPreferences as Record<string, unknown>
    : {};
  const existingPackPreference = basePackPreferences[packId];
  const nextPackPreference = existingPackPreference && typeof existingPackPreference === 'object'
    ? existingPackPreference as Record<string, unknown>
    : {};

  return {
    ...horrorDNA,
    packPreferences: {
      ...basePackPreferences,
      [packId]: {
        ...nextPackPreference,
        subgenres: selectedSubgenres,
      },
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid request body' }, 400);
  }

  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid onboarding payload',
      },
      400,
    );
  }
  const existingProfile = await prisma.userProfile.findUnique({ where: { userId: auth.userId } });
  let normalizedHorrorDna = ensureDefaultRecommendationStyle(
    parsed.data.horrorDNA ?? existingProfile?.horrorDNA ?? {},
  );
  let selectedPackId: string | undefined;
  let selectedPackSlug = DEFAULT_PACK_SLUG;
  if (seasonsPacksEnabled()) {
    const requestedSlug = (parsed.data.selectedPackSlug ?? DEFAULT_PACK_SLUG).toLowerCase();
    const pack = await prisma.genrePack.findUnique({
      where: { slug: requestedSlug },
      select: { id: true, slug: true, isEnabled: true },
    });
    if (pack && pack.isEnabled) {
      selectedPackId = pack.id;
      selectedPackSlug = pack.slug;
    } else {
      const fallback = await resolveEffectivePackForUser(prisma, auth.userId);
      if (fallback.packId) {
        selectedPackId = fallback.packId;
        selectedPackSlug = fallback.packSlug;
      }
    }
  } else {
    selectedPackSlug = (parsed.data.selectedPackSlug ?? DEFAULT_PACK_SLUG).toLowerCase();
  }

  const allowedSubgenres = new Set(getPackSubgenreOptions(selectedPackSlug).map(normalizeSubgenreValue));
  const selectedSubgenres = [...new Set((parsed.data.selectedSubgenres ?? [])
    .map(normalizeSubgenreValue)
    .filter((value) => value.length > 0))];
  if (selectedSubgenres.some((value) => !allowedSubgenres.has(value))) {
    return fail(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid subgenre selection for selected pack',
      },
      400,
    );
  }
  normalizedHorrorDna = applyPackSubgenres(normalizedHorrorDna, selectedPackId, selectedSubgenres);

  await prisma.userProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      onboardingCompleted: true,
      tolerance: parsed.data.tolerance,
      pacePreference: parsed.data.pacePreference,
      horrorDNA: normalizedHorrorDna as Prisma.InputJsonValue,
      ...(selectedPackId ? { selectedPackId } : {}),
    },
    update: {
      onboardingCompleted: true,
      tolerance: parsed.data.tolerance,
      pacePreference: parsed.data.pacePreference,
      horrorDNA: normalizedHorrorDna as Prisma.InputJsonValue,
      ...(selectedPackId ? { selectedPackId } : {}),
    },
  });

  return ok({ success: true }, { status: 200 });
}
