import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { buildFilmContextExplanation } from '@/lib/context/build-film-context-explanation';
import { buildSeasonReasonPanel } from '@/lib/context/build-season-reason-panel';

function normalizeSlug(input: string | null): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const tmdbIdParam = url.searchParams.get('tmdbId');
  const tmdbId = tmdbIdParam ? Number.parseInt(tmdbIdParam, 10) : NaN;
  if (!Number.isInteger(tmdbId)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId is required and must be an integer' }, 400);
  }

  const seasonSlugParam = normalizeSlug(url.searchParams.get('seasonSlug'));
  const packSlugParam = normalizeSlug(url.searchParams.get('packSlug'));
  const nodeSlug = normalizeSlug(url.searchParams.get('nodeSlug'));

  let seasonSlug = seasonSlugParam;
  let packSlug = packSlugParam;
  if (!seasonSlug || !packSlug) {
    const effective = await resolveEffectivePackForUser(prisma, auth.userId);
    seasonSlug = seasonSlug ?? effective.seasonSlug;
    packSlug = packSlug ?? effective.packSlug;
  }

  if (!seasonSlug || !packSlug) {
    return fail({ code: 'NOT_FOUND', message: 'Unable to resolve season/pack context' }, 404);
  }

  const [context, reasonPanel] = await Promise.all([
    buildFilmContextExplanation({
      seasonSlug,
      packSlug,
      nodeSlug,
      tmdbId,
    }),
    buildSeasonReasonPanel({
      seasonSlug,
      packSlug,
      nodeSlug,
      tmdbId,
    }),
  ]);

  return ok({ context, reasonPanel });
}
