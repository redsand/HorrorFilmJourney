import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { z } from 'zod';

const onboardingSchema = z.object({
  tolerance: z.number().int().min(1).max(5),
  pacePreference: z.enum(['slowburn', 'balanced', 'shock']),
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
  const normalizedHorrorDna = ensureDefaultRecommendationStyle(
    parsed.data.horrorDNA ?? existingProfile?.horrorDNA ?? {},
  );

  await prisma.userProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      onboardingCompleted: true,
      tolerance: parsed.data.tolerance,
      pacePreference: parsed.data.pacePreference,
      horrorDNA: normalizedHorrorDna,
    },
    update: {
      onboardingCompleted: true,
      tolerance: parsed.data.tolerance,
      pacePreference: parsed.data.pacePreference,
      horrorDNA: normalizedHorrorDna,
    },
  });

  return ok({ success: true }, { status: 200 });
}
