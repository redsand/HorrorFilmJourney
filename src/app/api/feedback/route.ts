import { FeedbackType } from '@prisma/client';
import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

const zFeedbackInput = z.object({
  type: z.nativeEnum(FeedbackType),
  category: z.string().trim().min(1).max(64).optional(),
  title: z.string().trim().min(5),
  description: z.string().trim().min(10),
  route: z.string().trim().min(1).max(512).optional(),
}).strict();

function extractSpoilerPolicy(route: string | undefined): 'NO_SPOILERS' | 'LIGHT' | 'FULL' | null {
  if (!route) {
    return null;
  }
  try {
    const parsed = new URL(route.startsWith('http') ? route : `http://local${route}`);
    const spoilerPolicy = parsed.searchParams.get('spoilerPolicy');
    if (spoilerPolicy === 'NO_SPOILERS' || spoilerPolicy === 'LIGHT' || spoilerPolicy === 'FULL') {
      return spoilerPolicy;
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = zFeedbackInput.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid feedback payload' }, 400);
  }

  const userAgent = request.headers.get('user-agent');
  const routeFromHeader = request.headers.get('x-current-route') ?? undefined;
  const appVersion = request.headers.get('x-app-version') ?? undefined;
  const currentRoute = parsed.data.route ?? routeFromHeader;
  const inCompanionMode = currentRoute?.startsWith('/companion/') ?? false;
  const spoilerPolicy = extractSpoilerPolicy(currentRoute);
  const latestBatch = await prisma.recommendationBatch.findFirst({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, journeyNode: true },
  });

  const created = await prisma.feedback.create({
    data: {
      userId: auth.userId,
      type: parsed.data.type,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      route: currentRoute,
      userAgent: userAgent ?? undefined,
      appVersion,
      metadata: {
        journeyNode: latestBatch?.journeyNode ?? null,
        lastRecommendationBatchId: latestBatch?.id ?? null,
        inCompanionMode,
        spoilerPolicy,
      },
    },
    select: { id: true },
  });

  return ok({ id: created.id });
}
