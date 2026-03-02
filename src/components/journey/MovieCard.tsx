'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { MovieCardVM } from '@/contracts/movieCardVM';
import { Button, Card, Chip, PosterImage, RatingBadges } from '@/components/ui';
import { QuickPoll } from '@/components/journey/QuickPoll';

type MovieCardProps = {
  card: MovieCardVM;
  recommendationItemId?: string;
  onInteractionSaved?: (tmdbId: number) => void;
  onRegenerated?: () => void;
};

type PollStatus = 'WATCHED' | 'ALREADY_SEEN';

type InteractionResponse = {
  data: {
    nextBatch?: {
      batchId: string;
    };
  };
};

async function postInteraction(
  payload: Record<string, unknown>,
): Promise<InteractionResponse> {
  const response = await fetch('/api/interactions', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as InteractionResponse;
}

export function MovieCard({
  card,
  recommendationItemId,
  onInteractionSaved,
  onRegenerated,
}: MovieCardProps) {
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [skipPending, setSkipPending] = useState(false);

  const ratingsForDisplay = useMemo(
    () => [
      { source: 'IMDB', ...card.ratings.imdb },
      ...card.ratings.additional.slice(0, 2),
    ],
    [card.ratings.additional, card.ratings.imdb],
  );
  const streamingProviders = useMemo(
    () => [...new Set(card.streaming.offers.map((offer) => offer.provider))].slice(0, 4),
    [card.streaming.offers],
  );

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="relative aspect-[2/3] w-full bg-[#111116]">
          <PosterImage
            alt={`${card.movie.title} poster`}
            className="object-cover"
            fill
            sizes="(max-width: 420px) 100vw, 420px"
            src={card.movie.posterUrl}
          />
        </div>

        <div className="space-y-3 p-4">
          <div>
            <h3 className="text-xl font-semibold">{card.movie.title}</h3>
            <p className="text-sm text-[var(--text-muted)]">{card.movie.year ?? 'Unknown year'}</p>
          </div>

          <RatingBadges ratings={ratingsForDisplay} />

          {(card.reception.critics || card.reception.audience || card.reception.summary) && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Reception</p>
              <div className="flex flex-wrap gap-2">
                {card.reception.critics && (
                  <Chip>Critics {card.reception.critics.rawValue ?? `${card.reception.critics.value}/100`}</Chip>
                )}
                {card.reception.audience && (
                  <Chip>Audience {card.reception.audience.rawValue ?? `${card.reception.audience.value}/100`}</Chip>
                )}
              </div>
              {card.reception.summary && (
                <p className="text-sm text-[var(--text-muted)]">{card.reception.summary}</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Streaming</p>
            <div className="flex flex-wrap gap-2">
              {streamingProviders.length > 0 ? (
                streamingProviders.map((provider) => <Chip key={provider}>{provider}</Chip>)
              ) : (
                <Chip>No providers listed</Chip>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Why it matters</p>
              <p className="text-sm">{card.codex.whyImportant}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">What it teaches</p>
              <p className="text-sm">{card.codex.whatItTeaches}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Watch for</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {card.codex.watchFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 pt-2">
            <Button className="min-h-11 text-base" onClick={() => setPollStatus('WATCHED')} type="button">
              Watch
            </Button>
            <Button
              className="min-h-11 text-base"
              onClick={() => setPollStatus('ALREADY_SEEN')}
              type="button"
              variant="secondary"
            >
              Already seen
            </Button>
            <button
              className="min-h-11 rounded-xl border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--text-muted)]"
              disabled={skipPending}
              onClick={async () => {
                setSkipPending(true);
                try {
                  await postInteraction({
                    tmdbId: card.movie.tmdbId,
                    status: 'SKIPPED',
                    ...(recommendationItemId ? { recommendationItemId } : {}),
                  });
                  onInteractionSaved?.(card.movie.tmdbId);
                } finally {
                  setSkipPending(false);
                }
              }}
              type="button"
            >
              {skipPending ? 'Skipping…' : 'Skip'}
            </button>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold"
              href={`/companion/${card.movie.tmdbId}?spoilerPolicy=NO_SPOILERS`}
            >
              Companion
            </Link>
          </div>
        </div>
      </Card>

      <QuickPoll
        onClose={() => setPollStatus(null)}
        onSubmit={async (payload) => {
          if (!pollStatus) {
            return;
          }
          const response = await postInteraction({
            tmdbId: card.movie.tmdbId,
            status: pollStatus,
            ...(recommendationItemId ? { recommendationItemId } : {}),
            ...payload,
          });
          if (response.data?.nextBatch?.batchId) {
            onRegenerated?.();
          } else {
            onInteractionSaved?.(card.movie.tmdbId);
          }
        }}
        open={pollStatus !== null}
        status={pollStatus ?? 'WATCHED'}
        title={card.movie.title}
      />
    </>
  );
}
