import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { seasonsPacksEnabled } from '@/lib/feature-flags';
import { listAvailablePacks, resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { DEFAULT_PACK_SLUG } from '@/lib/packs/constants';
import { getPackSubgenreOptions, MAX_SELECTED_SUBGENRES, normalizeSubgenreValue } from '@/lib/packs/subgenres';

const preferenceSchema = z.object({
  recommendationStyle: z.enum(['diversity', 'popularity']).optional(),
  selectedPackSlug: z.string().trim().min(1).optional(),
  selectedSubgenres: z.array(z.string().trim().min(1).max(32)).max(MAX_SELECTED_SUBGENRES).optional(),
}).refine((value) => value.recommendationStyle !== undefined || value.selectedPackSlug !== undefined || value.selectedSubgenres !== undefined, {
  message: 'At least one preference field is required',
});

function resolveRecommendationStyle(horrorDNA: unknown): 'diversity' | 'popularity' {
  if (!horrorDNA || typeof horrorDNA !== 'object') {
    return 'diversity';
  }
  const style = (horrorDNA as Record<string, unknown>).recommendationStyle;
  return style === 'popularity' ? 'popularity' : 'diversity';
}

function resolvePackSubgenres(horrorDNA: unknown, packId: string | null | undefined): string[] {
  if (!horrorDNA || typeof horrorDNA !== 'object' || !packId) {
    return [];
  }
  const packPreferences = (horrorDNA as Record<string, unknown>).packPreferences;
  if (!packPreferences || typeof packPreferences !== 'object') {
    return [];
  }
  const preference = (packPreferences as Record<string, unknown>)[packId];
  if (!preference || typeof preference !== 'object') {
    return [];
  }
  const subgenres = (preference as Record<string, unknown>).subgenres;
  if (!Array.isArray(subgenres)) {
    return [];
  }
  return [...new Set(subgenres
    .filter((entry): entry is string => typeof entry === 'string')
    .map(normalizeSubgenreValue)
    .filter((entry) => entry.length > 0))].slice(0, MAX_SELECTED_SUBGENRES);
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
    selectedSubgenres: resolvePackSubgenres(profile?.horrorDNA, effectivePack?.packId),
    availableSubgenres: getPackSubgenreOptions(effectivePack?.packSlug ?? DEFAULT_PACK_SLUG),
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
  let selectedPackSlug = DEFAULT_PACK_SLUG;
  if (seasonsPacksEnabled()) {
    const requested = (parsed.data.selectedPackSlug ?? DEFAULT_PACK_SLUG).toLowerCase();
    const available = await listAvailablePacks(prisma);
    const selected = available.packs.find((pack) => pack.slug === requested && pack.isEnabled);
    const packSlug = selected?.slug ?? DEFAULT_PACK_SLUG;
    selectedPackSlug = packSlug;
    const pack = await prisma.genrePack.findUnique({
      where: { slug: packSlug },
      select: { id: true, slug: true },
    });
    if (pack) {
      selectedPackId = pack.id;
      selectedPackSlug = pack.slug;
    }
  }

  if (!seasonsPacksEnabled()) {
    selectedPackSlug = (parsed.data.selectedPackSlug ?? DEFAULT_PACK_SLUG).toLowerCase();
  }

  if (parsed.data.selectedSubgenres && parsed.data.selectedSubgenres.length > 0 && !selectedPackId) {
    return fail({ code: 'VALIDATION_ERROR', message: 'Cannot set subgenres without selected pack' }, 400);
  }

  const normalizedSelectedSubgenres = parsed.data.selectedSubgenres
    ? [...new Set(parsed.data.selectedSubgenres.map(normalizeSubgenreValue).filter((value) => value.length > 0))]
    : undefined;
  if (normalizedSelectedSubgenres) {
    const allowed = new Set(getPackSubgenreOptions(selectedPackSlug).map(normalizeSubgenreValue));
    if (normalizedSelectedSubgenres.some((value) => !allowed.has(value))) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Invalid subgenre selection for selected pack' }, 400);
    }
  }

  const nextPackPreferences = (() => {
    if (!normalizedSelectedSubgenres || !selectedPackId) {
      return undefined;
    }
    const existingPackPreferences = existing?.horrorDNA && typeof existing.horrorDNA === 'object' && (existing.horrorDNA as Record<string, unknown>).packPreferences
      && typeof (existing.horrorDNA as Record<string, unknown>).packPreferences === 'object'
      ? (existing.horrorDNA as Record<string, unknown>).packPreferences as Record<string, unknown>
      : {};
    const existingPackPreference = existingPackPreferences[selectedPackId];
    const nextPackPreference = existingPackPreference && typeof existingPackPreference === 'object'
      ? existingPackPreference as Record<string, unknown>
      : {};
    return {
      ...existingPackPreferences,
      [selectedPackId]: {
        ...nextPackPreference,
        subgenres: normalizedSelectedSubgenres,
      },
    };
  })();
  const nextHorrorDnaWithPack = nextPackPreferences
    ? {
      ...nextHorrorDna,
      packPreferences: nextPackPreferences,
    }
    : nextHorrorDna;

  await prisma.userProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      onboardingCompleted: true,
      tolerance: existing?.tolerance ?? 3,
      pacePreference: existing?.pacePreference ?? 'balanced',
      horrorDNA: nextHorrorDnaWithPack as Prisma.InputJsonValue,
      ...(selectedPackId ? { selectedPackId } : {}),
    },
    update: {
      horrorDNA: nextHorrorDnaWithPack as Prisma.InputJsonValue,
      ...(selectedPackId ? { selectedPackId } : {}),
    },
  });

  return ok({ success: true });
}
