import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { publishSeasonNodeRelease } from '@/lib/nodes/governance';
import { getPublishedSeason1ReleaseSummaries } from '@/lib/nodes/published-snapshot';

async function resolveSeason1PackId(): Promise<string | null> {
  const pack = await prisma.genrePack.findUnique({
    where: { slug: 'horror' },
    select: {
      id: true,
      season: { select: { slug: true } },
    },
  });
  if (!pack || pack.season.slug !== 'season-1') {
    return null;
  }
  return pack.id;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const packId = await resolveSeason1PackId();
  if (!packId) {
    return fail({ code: 'NOT_FOUND', message: 'Season 1 horror pack not found' }, 404);
  }
  const limit = Math.max(1, Math.min(30, Number.parseInt(new URL(request.url).searchParams.get('limit') ?? '10', 10) || 10));
  const releases = await getPublishedSeason1ReleaseSummaries(prisma, { packId, limit });
  return ok({ releases });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }
  const body = await request.json().catch(() => ({}));
  const taxonomyVersion = typeof body?.taxonomyVersion === 'string' ? body.taxonomyVersion.trim() : undefined;
  const runId = typeof body?.runId === 'string' ? body.runId.trim() : undefined;

  const published = await publishSeasonNodeRelease(prisma, {
    seasonSlug: 'season-1',
    packSlug: 'horror',
    ...(taxonomyVersion ? { taxonomyVersion } : {}),
    ...(runId ? { runId } : {}),
  });

  return ok({
    releaseId: published.releaseId,
    taxonomyVersion: published.taxonomyVersion,
    runId: published.runId,
    status: 'published',
  });
}
