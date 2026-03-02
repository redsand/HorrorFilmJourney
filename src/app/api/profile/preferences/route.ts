import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';

const preferenceSchema = z.object({
  recommendationStyle: z.enum(['diversity', 'popularity']),
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
    select: { horrorDNA: true },
  });

  return ok({
    recommendationStyle: resolveRecommendationStyle(profile?.horrorDNA),
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

  await prisma.userProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      onboardingCompleted: true,
      tolerance: existing?.tolerance ?? 3,
      pacePreference: existing?.pacePreference ?? 'balanced',
      horrorDNA: {
        ...(existing?.horrorDNA && typeof existing.horrorDNA === 'object'
          ? existing.horrorDNA as Record<string, unknown>
          : {}),
        recommendationStyle: parsed.data.recommendationStyle,
      },
    },
    update: {
      horrorDNA: {
        ...(existing?.horrorDNA && typeof existing.horrorDNA === 'object'
          ? existing.horrorDNA as Record<string, unknown>
          : {}),
        recommendationStyle: parsed.data.recommendationStyle,
      },
    },
  });

  return ok({ success: true });
}

