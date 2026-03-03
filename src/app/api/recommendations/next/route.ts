import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';
import { toMovieCardVM } from '@/adapters/toMovieCardVM';
import { requireAuth } from '@/lib/auth/guards';
import { TmdbSyncUnavailableError } from '@/lib/tmdb/live-candidate-sync';
import { resolveRequestId, logHttpRequest } from '@/lib/observability/http';
import { captureError } from '@/lib/observability/error';

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    const response = fail(auth.error, auth.status);
    console.warn('[recommendations.next] unauthorized', { status: auth.status, requestId });
    logHttpRequest({ request, route: '/api/recommendations/next', status: response.status, startedAt, requestId });
    return response;
  }

  console.info('[recommendations.next] started');
  let result;
  try {
    result = await generateRecommendationBatch(auth.userId, prisma);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof TmdbSyncUnavailableError) {
      console.warn('[recommendations.next] tmdb unavailable', { durationMs });
      const response = fail({ code: 'TMDB_UNAVAILABLE', message: error.message }, 503);
      logHttpRequest({ request, route: '/api/recommendations/next', status: response.status, startedAt, requestId, userId: auth.userId });
      return response;
    }
    console.error('[recommendations.next] failed', { durationMs, requestId });
    await captureError(prisma, {
      route: '/api/recommendations/next',
      code: 'RECOMMENDATIONS_FAILED',
      message: error instanceof Error ? error.message : 'Unable to generate recommendations',
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
      userId: auth.userId,
    });
    const response = fail({ code: 'INTERNAL_ERROR', message: 'Unable to generate recommendations' }, 500);
    logHttpRequest({ request, route: '/api/recommendations/next', status: response.status, startedAt, requestId, userId: auth.userId });
    return response;
  }
  const cards = toMovieCardVM(result);
  const durationMs = Date.now() - startedAt;
  console.info('[recommendations.next] completed', {
    durationMs,
    cardCount: cards.length,
    batchId: result.batchId,
  });

  const response = ok(
    {
      batchId: result.batchId,
      cards,
      interactionContext: result.cards.map((card) => ({
        tmdbId: card.movie.tmdbId,
        recommendationItemId: card.id,
      })),
    },
    { status: 200 },
  );
  logHttpRequest({ request, route: '/api/recommendations/next', status: response.status, startedAt, requestId, userId: auth.userId });
  return response;
}
