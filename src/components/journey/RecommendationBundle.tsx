'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { MovieCardVM } from '@/contracts/movieCardVM';
import { MovieCard } from '@/components/journey/MovieCard';
import { Card } from '@/components/ui';

type RecommendationBundleProps = {
  cards: MovieCardVM[];
  batchId: string;
  interactionContext?: Array<{ tmdbId: number; recommendationItemId: string }>;
};

type RecommendationApiPayload = {
  batchId: string;
  cards: MovieCardVM[];
  interactionContext?: Array<{ tmdbId: number; recommendationItemId: string }>;
};

export function RecommendationBundle({
  cards,
  batchId,
  interactionContext = [],
}: RecommendationBundleProps) {
  const router = useRouter();
  const [visibleCards, setVisibleCards] = useState(cards);
  const [visibleBatchId, setVisibleBatchId] = useState(batchId);
  const [contextMap, setContextMap] = useState(
    () => new Map(interactionContext.map((item) => [item.tmdbId, item.recommendationItemId] as const)),
  );

  useEffect(() => {
    setVisibleCards(cards);
    setVisibleBatchId(batchId);
    setContextMap(new Map(interactionContext.map((item) => [item.tmdbId, item.recommendationItemId] as const)));
  }, [batchId, cards, interactionContext]);

  const visibleTmdbIds = useMemo(
    () => new Set(visibleCards.map((card) => card.movie.tmdbId)),
    [visibleCards],
  );

  async function replaceSingleCard(interactedTmdbId: number): Promise<void> {
    const response = await fetch('/api/recommendations/next', {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      router.refresh();
      return;
    }

    const payload = (await response.json().catch(() => null)) as { data?: RecommendationApiPayload } | null;
    const nextBatch = payload?.data;
    if (!nextBatch || !Array.isArray(nextBatch.cards)) {
      router.refresh();
      return;
    }

    const replacement = nextBatch.cards.find((candidate) => {
      if (candidate.movie.tmdbId === interactedTmdbId) {
        return false;
      }
      return !visibleTmdbIds.has(candidate.movie.tmdbId);
    });

    if (!replacement) {
      router.refresh();
      return;
    }

    setVisibleCards((current) => {
      const index = current.findIndex((card) => card.movie.tmdbId === interactedTmdbId);
      if (index < 0) {
        return current;
      }
      const updated = [...current];
      updated[index] = replacement;
      return updated;
    });

    setVisibleBatchId(nextBatch.batchId);
    setContextMap((current) => {
      const next = new Map(current);
      next.delete(interactedTmdbId);
      const mapped = nextBatch.interactionContext?.find((item) => item.tmdbId === replacement.movie.tmdbId);
      if (mapped) {
        next.set(mapped.tmdbId, mapped.recommendationItemId);
      }
      return next;
    });
  }

  if (visibleCards.length === 0) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">No cards available</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Generate a recommendation bundle to begin.
        </p>
      </Card>
    );
  }

  return (
    <section aria-label="Recommendation bundle" className="space-y-3">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
        Bundle {visibleBatchId.slice(0, 8)}
      </p>
      {visibleCards.map((card) => (
        <MovieCard
          card={card}
          key={card.movie.tmdbId}
          onRegenerated={() => router.refresh()}
          onInteractionSaved={replaceSingleCard}
          recommendationItemId={contextMap.get(card.movie.tmdbId)}
        />
      ))}
    </section>
  );
}
