import { zMovieCardVMArray, type MovieCardVM } from '@/contracts/movieCardVM';
import type { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';

export type RecommendationBatchPayload = Awaited<ReturnType<typeof generateRecommendationBatch>>;

const RECEPTION_FALLBACK_SUMMARY = 'Reception data currently unavailable.';
const ALLOWED_SCORE_SCALES = new Set(['10', '100']);

function toWatchFor(watchFor: unknown): [string, string, string] {
  const entries = Array.isArray(watchFor)
    ? watchFor.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  if (entries.length >= 3) {
    return [entries[0]!, entries[1]!, entries[2]!];
  }

  const fallback = ['Key visual motif', 'Atmosphere and pacing', 'Character performance beat'];
  const merged = [...entries, ...fallback].slice(0, 3);
  return [merged[0]!, merged[1]!, merged[2]!];
}

export function toMovieCardVM(batch: RecommendationBatchPayload): MovieCardVM[] {
  const cards = batch.cards.map((card) => {
    const sanitizedAdditional = Array.isArray(card.ratings?.additional)
      ? card.ratings.additional
        .filter((rating) =>
          rating
          && typeof rating.source === 'string'
          && typeof rating.value === 'number'
          && ALLOWED_SCORE_SCALES.has(rating.scale))
        .slice(0, 3)
      : [];

    const criticsScore =
      card.narrative.reception && typeof card.narrative.reception.critics === 'number'
        ? {
            source: 'Critics Aggregate',
            value: card.narrative.reception.critics,
            scale: '100' as const,
          }
        : undefined;

    const audienceScore =
      card.narrative.reception && typeof card.narrative.reception.audience === 'number'
        ? {
            source: 'Audience Aggregate',
            value: card.narrative.reception.audience,
            scale: '100' as const,
          }
        : undefined;

    const hasAggregates = Boolean(criticsScore || audienceScore);
    const fallbackAdditional = criticsScore ?? audienceScore;
    const normalizedAdditional = sanitizedAdditional.length > 0
      ? sanitizedAdditional
      : (fallbackAdditional ? [fallbackAdditional] : []);

    return {
      movie: {
        tmdbId: card.movie.tmdbId,
        title: card.movie.title,
        ...(card.movie.year ? { year: card.movie.year } : {}),
        posterUrl: card.movie.posterUrl,
      },
      ratings: {
        imdb: card.ratings.imdb,
        additional: normalizedAdditional,
      },
      reception: {
        ...(criticsScore ? { critics: criticsScore } : {}),
        ...(audienceScore ? { audience: audienceScore } : {}),
        summary: hasAggregates ? 'Reception derived from aggregate scores.' : RECEPTION_FALLBACK_SUMMARY,
      },
      credits: {
        castHighlights: card.narrative.castHighlights,
      },
      streaming: {
        region: 'US',
        offers: card.narrative.streaming,
      },
      codex: {
        whyImportant: card.narrative.whyImportant,
        whatItTeaches: card.narrative.whatItTeaches,
        watchFor: toWatchFor(card.narrative.watchFor),
        historicalContext: card.narrative.historicalContext,
        spoilerPolicy: card.narrative.spoilerPolicy ?? 'NO_SPOILERS',
        journeyNode: card.narrative.journeyNode,
        nextStepHint: card.narrative.nextStepHint,
      },
      evidence: (card as { evidence?: Array<{ sourceName: string; url?: string; snippet: string; retrievedAt: string | Date }> }).evidence?.map((item) => ({
        sourceName: item.sourceName,
        ...(item.url ? { url: item.url } : {}),
        snippet: item.snippet,
        retrievedAt: typeof item.retrievedAt === 'string' ? item.retrievedAt : item.retrievedAt.toISOString(),
      })) ?? [],
    };
  });

  return zMovieCardVMArray.parse(cards);
}
