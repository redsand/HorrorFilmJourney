import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { getSeasonJourneyMap } from '@/lib/journey/get-season-journey-map';

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
    return fail({ code: 'NOT_FOUND', message: 'Unable to resolve season/pack for journey map' }, 404);
  }

  const data = await getSeasonJourneyMap({
    seasonSlug,
    packSlug,
    userId: auth.userId,
  });
  return ok(data);
}
