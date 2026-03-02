import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/request-context';
import { z } from 'zod';

const onboardingSchema = z.object({
  tolerance: z.number().int().min(1).max(5),
  pacePreference: z.enum(['slowburn', 'balanced', 'shock']),
  horrorDNA: z.unknown().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { userId, error } = await getCurrentUserId(request, prisma);
  if (error || !userId) {
    return fail(error ?? { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' }, 400);
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
  const existingProfile = await prisma.userProfile.findUnique({ where: { userId } });

  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      onboardingCompleted: true,
      tolerance: parsed.data.tolerance,
      pacePreference: parsed.data.pacePreference,
      horrorDNA: parsed.data.horrorDNA ?? {},
    },
    update: {
      onboardingCompleted: true,
      tolerance: parsed.data.tolerance,
      pacePreference: parsed.data.pacePreference,
      horrorDNA: parsed.data.horrorDNA ?? existingProfile?.horrorDNA ?? {},
    },
  });

  return ok({ success: true }, { status: 200 });
}
