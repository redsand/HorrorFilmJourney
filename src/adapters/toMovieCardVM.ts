import { zMovieCardVMArray, type MovieCardVM } from '@/contracts/movieCardVM';
import type { generateRecommendationBatch } from '@/lib/recommendation/recommendation-engine';

export type RecommendationBatchPayload = Awaited<ReturnType<typeof generateRecommendationBatch>>;

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

    return {
      movie: {
        tmdbId: card.movie.tmdbId,
        title: card.movie.title,
        ...(card.movie.year ? { year: card.movie.year } : {}),
        posterUrl: card.movie.posterUrl,
      },
      ratings: card.ratings,
      reception: {
        ...(criticsScore ? { critics: criticsScore } : {}),
        ...(audienceScore ? { audience: audienceScore } : {}),
        summary:
          card.narrative.reception?.summary ??
          (criticsScore || audienceScore
            ? 'Reception derived from aggregate scores.'
            : 'Reception data unavailable for this title.'),
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
      evidence: [],
    };
  });

  return zMovieCardVMArray.parse(cards);
}
