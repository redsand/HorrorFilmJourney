import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { getNextCurriculumSteps } from '@/lib/journey/get-next-curriculum-steps';

function normalizeSlug(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const tmdbIdRaw = url.searchParams.get('tmdbId');
  const tmdbId = tmdbIdRaw ? Number.parseInt(tmdbIdRaw, 10) : NaN;
  if (!Number.isInteger(tmdbId)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId is required and must be an integer' }, 400);
  }

  const seasonSlugParam = normalizeSlug(url.searchParams.get('seasonSlug'));
  const packSlugParam = normalizeSlug(url.searchParams.get('packSlug'));

  let seasonSlug = seasonSlugParam;
  let packSlug = packSlugParam;
  if (!seasonSlug || !packSlug) {
    const effective = await resolveEffectivePackForUser(prisma, auth.userId);
    seasonSlug = seasonSlug ?? effective.seasonSlug;
    packSlug = packSlug ?? effective.packSlug;
  }
  if (!seasonSlug || !packSlug) {
    return ok(null);
  }

  const data = await getNextCurriculumSteps({
    seasonSlug,
    packSlug,
    tmdbId,
    userId: auth.userId,
  });
  return ok(data);
}
