'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { MovieCardVM } from '@/contracts/movieCardVM';
import { JOURNEY_INTERACTION_SAVED_EVENT } from '@/components/journey/JourneyMasteryCard';
import { Button, Card, Chip, PosterImage, RatingBadges } from '@/components/ui';
import { QuickPoll } from '@/components/journey/QuickPoll';

type MovieCardProps = {
  card: MovieCardVM;
  recommendationItemId?: string;
  onInteractionSaved?: (tmdbId: number) => void;
  isRefreshing?: boolean;
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
  isRefreshing = false,
}: MovieCardProps) {
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [skipPending, setSkipPending] = useState(false);
  const [subgenres, setSubgenres] = useState<string[]>([]);

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
  const [tagline, setTagline] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/movies/tagline?tmdbId=${card.movie.tmdbId}`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          if (active) {
            setTagline(null);
          }
          return;
        }
        const payload = await response.json() as { data?: { tagline?: string | null } };
        if (active) {
          const value = payload?.data?.tagline;
          setTagline(typeof value === 'string' && value.trim().length > 0 ? value.trim() : null);
        }
      } catch {
        if (active) {
          setTagline(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [card.movie.tmdbId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/movies/subgenres?tmdbId=${card.movie.tmdbId}`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          if (active) {
            setSubgenres([]);
          }
          return;
        }
        const payload = await response.json() as { data?: { subgenres?: string[] } };
        if (active) {
          setSubgenres(Array.isArray(payload?.data?.subgenres) ? payload.data.subgenres : []);
        }
      } catch {
        if (active) {
          setSubgenres([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [card.movie.tmdbId]);

  return (
    <>
      <Card className="relative overflow-hidden p-0">
        {isRefreshing ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(8,8,10,0.68)]">
            <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(18,18,22,0.92)] px-3 py-2 text-sm text-[var(--text)]">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[rgba(255,255,255,0.3)] border-t-[var(--accent)]" />
              Refreshing this slot...
            </div>
          </div>
        ) : null}
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
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-xl font-semibold">{card.movie.title}</h3>
              <p className="text-sm text-[var(--text-muted)]">{card.movie.year ?? 'Unknown year'}</p>
            </div>
            {tagline ? (
              <p className="mt-1 text-sm italic text-[var(--text-muted)]">&ldquo;{tagline}&rdquo;</p>
            ) : null}
          </div>

          <RatingBadges ratings={ratingsForDisplay} />

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

          {subgenres.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Subgenre(s)</p>
              <div className="flex flex-wrap gap-2">
                {subgenres.map((genre) => (
                  <Chip key={genre}>{genre}</Chip>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Why it matters</p>
              <p className="mt-1 text-sm leading-relaxed">{card.codex.whyImportant}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">What it teaches</p>
              <p className="mt-1 text-sm leading-relaxed">{card.codex.whatItTeaches}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Watch for</p>
              <ul className="mt-1 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {card.codex.watchFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 pt-2">
            <Button className="min-h-11 text-base" disabled={isRefreshing} onClick={() => setPollStatus('WATCHED')} type="button">
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7-11-7Z" fill="currentColor" />
              </svg>
              Watch
            </Button>
            <Button
              className="min-h-11 text-base"
              disabled={isRefreshing}
              onClick={() => setPollStatus('ALREADY_SEEN')}
              type="button"
              variant="secondary"
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path d="M9 12.75 11.5 15 16 9.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Already seen
            </Button>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--text-muted)]"
              disabled={skipPending || isRefreshing}
              onClick={async () => {
                setSkipPending(true);
                try {
                  await postInteraction({
                    tmdbId: card.movie.tmdbId,
                    status: 'SKIPPED',
                    ...(recommendationItemId ? { recommendationItemId } : {}),
                  });
                  window.dispatchEvent(new Event(JOURNEY_INTERACTION_SAVED_EVENT));
                  onInteractionSaved?.(card.movie.tmdbId);
                } finally {
                  setSkipPending(false);
                }
              }}
              type="button"
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path d="M4 6h16M7 6v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6M10 10v6M14 10v6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
              {skipPending ? 'Skipping…' : 'Skip'}
            </button>
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold"
              href={`/companion/${card.movie.tmdbId}?spoilerPolicy=NO_SPOILERS`}
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path d="M12 3 4 7v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V7l-8-4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                <path d="M9.5 12.5 11 14l3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
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
          await postInteraction({
            tmdbId: card.movie.tmdbId,
            status: pollStatus,
            ...(recommendationItemId ? { recommendationItemId } : {}),
            ...payload,
          });
          window.dispatchEvent(new Event(JOURNEY_INTERACTION_SAVED_EVENT));
          onInteractionSaved?.(card.movie.tmdbId);
        }}
        open={pollStatus !== null}
        status={pollStatus ?? 'WATCHED'}
        title={card.movie.title}
      />
    </>
  );
}
