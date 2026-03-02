import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/request-context';
import { buildEvidenceDedupKey } from '@/lib/evidence/evidence-dedupe';

export async function POST(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { error } = await getCurrentUserId(request, prisma);
  if (error) {
    return fail(error, 400);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return fail({ code: 'VALIDATION_ERROR', message: 'Invalid request body' }, 400);
  }

  const { tmdbId, sourceName, url, snippet, retrievedAt } = body as Record<string, unknown>;

  if (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId must be an integer' }, 400);
  }
  if (typeof sourceName !== 'string' || sourceName.trim().length === 0) {
    return fail({ code: 'VALIDATION_ERROR', message: 'sourceName is required' }, 400);
  }
  if (url !== undefined && typeof url !== 'string') {
    return fail({ code: 'VALIDATION_ERROR', message: 'url must be a string when provided' }, 400);
  }
  if (typeof snippet !== 'string' || snippet.trim().length === 0) {
    return fail({ code: 'VALIDATION_ERROR', message: 'snippet is required' }, 400);
  }
  if (typeof retrievedAt !== 'string' || Number.isNaN(Date.parse(retrievedAt))) {
    return fail({ code: 'VALIDATION_ERROR', message: 'retrievedAt must be an ISO date string' }, 400);
  }

  const movie = await prisma.movie.findUnique({ where: { tmdbId }, select: { id: true } });
  if (!movie) {
    return fail({ code: 'NOT_FOUND', message: 'Movie not found' }, 404);
  }

  const hash = buildEvidenceDedupKey({
    movieId: movie.id,
    sourceName,
    url: typeof url === 'string' ? url : undefined,
    snippet,
  });

  const record = await prisma.evidencePacket.upsert({
    where: { hash },
    create: {
      movieId: movie.id,
      sourceName: sourceName.trim(),
      url: typeof url === 'string' ? url.trim() : '',
      snippet: snippet.trim(),
      retrievedAt: new Date(retrievedAt),
      hash,
    },
    update: {
      retrievedAt: new Date(retrievedAt),
    },
    select: {
      id: true,
      movieId: true,
      sourceName: true,
      url: true,
      snippet: true,
      retrievedAt: true,
      hash: true,
    },
  });

  return ok(record, { status: 200 });
}
