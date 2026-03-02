import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';
import { toMovieCardVM } from '@/adapters/toMovieCardVM';
import { requireAuth } from '@/lib/auth/guards';
import { TmdbSyncUnavailableError } from '@/lib/tmdb/live-candidate-sync';

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    console.warn('[recommendations.next] unauthorized', { status: auth.status });
    return fail(auth.error, auth.status);
  }

  console.info('[recommendations.next] started');
  let result;
  try {
    result = await generateRecommendationBatch(auth.userId, prisma);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof TmdbSyncUnavailableError) {
      console.warn('[recommendations.next] tmdb unavailable', { durationMs });
      return fail({ code: 'TMDB_UNAVAILABLE', message: error.message }, 503);
    }
    console.error('[recommendations.next] failed', { durationMs });
    return fail({ code: 'INTERNAL_ERROR', message: 'Unable to generate recommendations' }, 500);
  }
  const cards = toMovieCardVM(result);
  const durationMs = Date.now() - startedAt;
  console.info('[recommendations.next] completed', {
    durationMs,
    cardCount: cards.length,
    batchId: result.batchId,
  });

  return ok(
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
}
