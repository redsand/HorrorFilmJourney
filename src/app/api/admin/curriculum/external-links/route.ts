import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { getAllowedExternalSourcesForSeason } from '@/lib/companion/external-reading-registry';

const createExternalLinkSchema = z.object({
  movieId: z.string().trim().min(1),
  seasonId: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  articleTitle: z.string().trim().min(1),
  url: z.string().url(),
  sourceType: z.enum(['review', 'essay', 'retrospective']),
  publicationDate: z.string().datetime().optional(),
});

function hostAllowed(url: string, allowedHosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const normalized = allowedHosts.map((item) => item.toLowerCase());
    return normalized.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const movieId = (url.searchParams.get('movieId') ?? '').trim();
  const seasonId = (url.searchParams.get('seasonId') ?? '').trim();
  if (!movieId || !seasonId) {
    return fail({ code: 'VALIDATION_ERROR', message: 'movieId and seasonId are required' }, 400);
  }

  const allowedSources = getAllowedExternalSourcesForSeason(seasonId);
  const rows = await prisma.externalReadingCuration.findMany({
    where: { movieId, seasonId },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      sourceName: true,
      articleTitle: true,
      url: true,
      seasonId: true,
      publicationDate: true,
      sourceType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return ok({
    allowedSources,
    items: rows.map((row) => ({
      id: row.id,
      sourceName: row.sourceName,
      articleTitle: row.articleTitle,
      url: row.url,
      seasonId: row.seasonId,
      sourceType: row.sourceType.toLowerCase(),
      publicationDate: row.publicationDate?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = createExternalLinkSchema.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' }, 400);
  }

  const payload = parsed.data;
  const allowedSources = getAllowedExternalSourcesForSeason(payload.seasonId);
  if (allowedSources.length === 0) {
    return fail({ code: 'VALIDATION_ERROR', message: 'No allowed external sources are configured for this season' }, 400);
  }

  const matchedSource = allowedSources.find((source) => source.sourceName === payload.sourceName);
  if (!matchedSource) {
    return fail({ code: 'VALIDATION_ERROR', message: 'sourceName is not allowed for this season' }, 400);
  }

  if (!hostAllowed(payload.url, matchedSource.domains)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'URL domain is not allowed for selected source/season' }, 400);
  }

  const row = await prisma.externalReadingCuration.upsert({
    where: {
      movieId_seasonId_url: {
        movieId: payload.movieId,
        seasonId: payload.seasonId,
        url: payload.url,
      },
    },
    create: {
      movieId: payload.movieId,
      seasonId: payload.seasonId,
      sourceName: payload.sourceName,
      articleTitle: payload.articleTitle,
      url: payload.url,
      sourceType: payload.sourceType.toUpperCase() as 'REVIEW' | 'ESSAY' | 'RETROSPECTIVE',
      publicationDate: payload.publicationDate ? new Date(payload.publicationDate) : null,
      createdByUserId: auth.userId,
    },
    update: {
      sourceName: payload.sourceName,
      articleTitle: payload.articleTitle,
      sourceType: payload.sourceType.toUpperCase() as 'REVIEW' | 'ESSAY' | 'RETROSPECTIVE',
      publicationDate: payload.publicationDate ? new Date(payload.publicationDate) : null,
    },
  });

  await prisma.auditEvent.create({
    data: {
      userId: auth.userId,
      action: 'external_reading.upsert',
      targetId: row.id,
      metadata: {
        movieId: payload.movieId,
        seasonId: payload.seasonId,
        sourceName: payload.sourceName,
        sourceType: payload.sourceType,
      },
    },
  });

  return ok({
    id: row.id,
    sourceName: row.sourceName,
    articleTitle: row.articleTitle,
    url: row.url,
    seasonId: row.seasonId,
    sourceType: row.sourceType.toLowerCase(),
    publicationDate: row.publicationDate?.toISOString(),
  });
}

