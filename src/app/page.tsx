import Link from 'next/link';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { MovieCardVM } from '@/contracts/movieCardVM';
import { RecommendationBundle, RefreshRecommendationsButton } from '@/components/journey';
import { BottomNav, Button, Card } from '@/components/ui';

type ExperienceResponse = {
  state: 'ONBOARDING_NEEDED' | 'SHOW_RECOMMENDATION_BUNDLE' | 'SHOW_QUICK_POLL' | 'SHOW_HISTORY';
  bundle?: {
    id: string;
    journeyNode?: string | null;
    cards?: Array<{
      id: string;
      movie: {
        tmdbId: number;
        title: string;
        year: number | null;
        posterUrl: string;
        ratings: Array<{
          source: string;
          value: number;
          scale: string;
          rawValue: string | null;
        }>;
      };
      narrative: {
        whyImportant: string;
        whatItTeaches: string;
        historicalContext: string;
        nextStepHint: string;
        watchFor: unknown;
        reception: unknown;
        castHighlights: unknown;
        streaming: unknown;
        spoilerPolicy: string;
      };
    }>;
  };
  quickPoll?: {
    prompt?: string;
  };
};

type RecommendationResponse = {
  batchId: string;
  cards: MovieCardVM[];
  interactionContext?: Array<{
    tmdbId: number;
    recommendationItemId: string;
  }>;
};

function toWatchForTuple(watchFor: unknown): [string, string, string] {
  const entries = Array.isArray(watchFor)
    ? watchFor.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const fallback = ['Key visual motif', 'Atmosphere and pacing', 'Character performance beat'];
  const merged = [...entries, ...fallback].slice(0, 3);
  return [merged[0]!, merged[1]!, merged[2]!];
}

function toMovieCardFromExperienceCard(
  card: NonNullable<NonNullable<ExperienceResponse['bundle']>['cards']>[number],
  journeyNode: string | null | undefined,
): MovieCardVM | null {
  const imdb = card.movie.ratings.find((rating) => rating.source === 'IMDB');
  if (!imdb) {
    return null;
  }
  const additional = card.movie.ratings
    .filter((rating) => rating.source !== 'IMDB')
    .slice(0, 3)
    .map((rating) => ({
      source: rating.source,
      value: rating.value,
      scale: rating.scale === '100' ? '100' as const : '10' as const,
      ...(rating.rawValue ? { rawValue: rating.rawValue } : {}),
    }));
  if (additional.length < 1) {
    return null;
  }

  const reception = (card.narrative.reception && typeof card.narrative.reception === 'object')
    ? card.narrative.reception as { critics?: number; audience?: number; summary?: string }
    : {};
  const castHighlights = Array.isArray(card.narrative.castHighlights)
    ? card.narrative.castHighlights
      .filter((entry): entry is { name: string; role?: string } =>
        typeof entry === 'object'
        && entry !== null
        && typeof (entry as { name?: unknown }).name === 'string')
      .slice(0, 6)
    : [];
  const streamingOffers = Array.isArray(card.narrative.streaming)
    ? card.narrative.streaming
      .filter((entry): entry is { provider: string; type: 'subscription' | 'rent' | 'buy' | 'free'; url?: string; price?: string } =>
        typeof entry === 'object'
        && entry !== null
        && typeof (entry as { provider?: unknown }).provider === 'string'
        && ['subscription', 'rent', 'buy', 'free'].includes(String((entry as { type?: unknown }).type)))
      .map((entry) => ({
        provider: entry.provider,
        type: entry.type,
        ...(entry.url ? { url: entry.url } : {}),
        ...(entry.price ? { price: entry.price } : {}),
      }))
    : [];

  return {
    movie: {
      tmdbId: card.movie.tmdbId,
      title: card.movie.title,
      ...(typeof card.movie.year === 'number' ? { year: card.movie.year } : {}),
      posterUrl: card.movie.posterUrl,
    },
    ratings: {
      imdb: {
        value: imdb.value,
        scale: imdb.scale === '100' ? '100' as const : '10' as const,
        ...(imdb.rawValue ? { rawValue: imdb.rawValue } : {}),
      },
      additional,
    },
    reception: {
      ...(typeof reception.critics === 'number'
        ? { critics: { source: 'Critics Aggregate', value: reception.critics, scale: '100' as const } }
        : {}),
      ...(typeof reception.audience === 'number'
        ? { audience: { source: 'Audience Aggregate', value: reception.audience, scale: '100' as const } }
        : {}),
      ...(typeof reception.summary === 'string'
        ? { summary: reception.summary }
        : { summary: 'Reception data currently unavailable.' }),
    },
    credits: {
      castHighlights,
    },
    streaming: {
      region: 'US',
      offers: streamingOffers,
    },
    codex: {
      whyImportant: card.narrative.whyImportant,
      whatItTeaches: card.narrative.whatItTeaches,
      watchFor: toWatchForTuple(card.narrative.watchFor),
      historicalContext: card.narrative.historicalContext,
      spoilerPolicy: (card.narrative.spoilerPolicy === 'FULL' || card.narrative.spoilerPolicy === 'LIGHT')
        ? card.narrative.spoilerPolicy
        : 'NO_SPOILERS',
      journeyNode: journeyNode ?? 'ENGINE_MODERN_CORE',
      nextStepHint: card.narrative.nextStepHint,
    },
    evidence: [],
  };
}

function formatJourneyNodeLabel(journeyNode: string | null | undefined): string {
  if (!journeyNode) {
    return 'initializing';
  }

  const mode = process.env.REC_ENGINE_MODE === 'modern' ? 'modern' : 'v1';
  if (mode === 'modern' && journeyNode.startsWith('ENGINE_V1_CORE')) {
    return journeyNode.replace('ENGINE_V1_CORE', 'ENGINE_MODERN_CORE');
  }

  return journeyNode;
}

function getOrigin(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

function getCookieHeader(): string | null {
  return headers().get('cookie');
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: { code: string; message: string } | null; status: number }> {
  const requestHeaders = new Headers(init?.headers);
  const cookie = getCookieHeader();
  if (cookie) {
    requestHeaders.set('cookie', cookie);
  }

  const response = await fetch(`${getOrigin()}${path}`, {
    cache: 'no-store',
    ...init,
    headers: requestHeaders,
  });

  const payload = (await response.json()) as { data: T | null; error: { code: string; message: string } | null };
  return { ...payload, status: response.status };
}

async function submitOnboarding(formData: FormData): Promise<void> {
  'use server';
  const tolerance = Number(formData.get('tolerance'));
  const pacePreference = String(formData.get('pacePreference') ?? 'balanced');

  await apiJson('/api/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tolerance, pacePreference, horrorDNA: {} }),
  });
  revalidatePath('/');
}

export default async function HomePage() {
  const experienceResponse = await apiJson<ExperienceResponse>('/api/experience', { method: 'GET' });
  const experience = experienceResponse.status === 200 ? experienceResponse.data : null;
  const unauthenticated = experienceResponse.status === 401;

  let recommendations: RecommendationResponse | null = null;
  if (!unauthenticated && (experience?.state === 'SHOW_RECOMMENDATION_BUNDLE' || experience?.state === 'SHOW_QUICK_POLL')) {
    const mappedCards = (experience.bundle?.cards ?? [])
      .map((card) => toMovieCardFromExperienceCard(card, experience.bundle?.journeyNode))
      .filter((card): card is MovieCardVM => card !== null);
    if (mappedCards.length > 0) {
      recommendations = {
        batchId: experience.bundle?.id ?? 'current',
        cards: mappedCards,
        interactionContext: (experience.bundle?.cards ?? []).map((card) => ({
          tmdbId: card.movie.tmdbId,
          recommendationItemId: card.id,
        })),
      };
    }
  }

  const journeyNode =
    recommendations?.cards?.[0]?.codex?.journeyNode
    ?? experience?.bundle?.journeyNode;
  const journeyNodeLabel = formatJourneyNodeLabel(journeyNode);

  if (unauthenticated) {
    return (
      <main className="flex flex-1 flex-col gap-4 pb-8 pt-4">
        <header className="rounded-2xl border border-[var(--border)] bg-[rgba(12,12,16,0.85)] p-5 shadow-[0_12px_34px_rgba(0,0,0,0.45)]">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Horror Codex</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">
            Find your next great horror film, not random picks.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            A mobile-first recommendation engine that adapts to your tolerance, pace, and watch history.
            Each pick includes context, what to watch for, and companion notes built for real viewing nights.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link href="/signup"><Button className="w-full">Create account</Button></Link>
            <Link href="/login"><Button className="w-full" variant="secondary">Login</Button></Link>
          </div>
        </header>

        <Card>
          <h2 className="text-lg font-semibold">Why it feels better than generic movie apps</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
            <li>• Structured 5-film journeys instead of endless scroll.</li>
            <li>• Quick Poll feedback updates your next batch in real time.</li>
            <li>• Companion mode keeps context spoiler-safe while you watch.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">What you get in each recommendation</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
            <li>• Poster, ratings, reception, and streaming availability.</li>
            <li>• Why it matters, what it teaches, and exactly 3 watch-for cues.</li>
            <li>• Cast/director highlights and historical context.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Start in under one minute</h2>
          <ol className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
            <li>1. Create your account.</li>
            <li>2. Answer a two-question onboarding poll.</li>
            <li>3. Get your first tailored horror bundle.</li>
          </ol>
          <div className="mt-4 flex gap-2">
            <Link href="/signup"><Button>Create account</Button></Link>
            <Link href="/login"><Button variant="secondary">I already have one</Button></Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <h1 className="text-xl font-semibold">Horror Codex</h1>
        <p className="text-xs text-[var(--text-muted)]">
          {`Journey: ${journeyNodeLabel}`}
        </p>
      </header>

      {experience?.state === 'ONBOARDING_NEEDED' && (
        <Card>
          <h2 className="text-lg font-semibold">Onboarding</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Tune your next recommendations with two quick taps.
          </p>
          <form action={submitOnboarding} className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Intensity</p>
              <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">
                Sets how extreme your recommendations get: lower values favor atmospheric tension, higher values allow heavier violence and shock.
              </p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value} className="cursor-pointer">
                    <input className="peer sr-only" type="radio" name="tolerance" value={value} defaultChecked={value === 3} />
                    <span className="block rounded-lg border border-[var(--border)] px-0 py-2 text-center text-sm peer-checked:border-[rgba(193,18,31,0.7)] peer-checked:bg-[rgba(155,17,30,0.22)]">
                      {value}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Pace</p>
              <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">
                Controls story rhythm: slowburn builds dread, balanced mixes tension and release, shock emphasizes immediate high-impact moments.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'slowburn', label: 'Slowburn' },
                  { id: 'balanced', label: 'Balanced' },
                  { id: 'shock', label: 'Shock' },
                ].map((item) => (
                  <label key={item.id} className="cursor-pointer">
                    <input className="peer sr-only" type="radio" name="pacePreference" value={item.id} defaultChecked={item.id === 'balanced'} />
                    <span className="block rounded-lg border border-[var(--border)] px-2 py-2 text-center text-sm peer-checked:border-[rgba(193,18,31,0.7)] peer-checked:bg-[rgba(155,17,30,0.22)]">
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full py-3 text-base" type="submit">Save Preferences</Button>
          </form>
        </Card>
      )}

      {(experience?.state === 'SHOW_RECOMMENDATION_BUNDLE' || experience?.state === 'SHOW_QUICK_POLL') && (
        <>
          {experience.state === 'SHOW_QUICK_POLL' && (
            <Card>
              <h2 className="text-lg font-semibold">Quick poll ready</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {experience.quickPoll?.prompt ?? 'Give quick feedback on your latest choice, then continue your journey.'}
              </p>
            </Card>
          )}
          {recommendations?.cards?.length ? (
            <RecommendationBundle
              batchId={recommendations.batchId}
              cards={recommendations.cards}
              interactionContext={recommendations.interactionContext}
            />
          ) : (
            <Card>
              <h2 className="text-lg font-semibold">No current recommendation batch</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Your current picks stay fixed until you explicitly refresh.
              </p>
            </Card>
          )}
          <RefreshRecommendationsButton
            label={experience.bundle ? 'Refresh Recommendations' : 'Generate Recommendations'}
          />
        </>
      )}

      {experience?.state === 'SHOW_HISTORY' && (
        <Card>
          <h2 className="text-lg font-semibold">History Ready</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">You&apos;ve completed enough actions to review your timeline.</p>
          <Link className="mt-4 inline-flex" href="/history"><Button>Open History</Button></Link>
        </Card>
      )}

      {experience?.state !== 'ONBOARDING_NEEDED' && (
        <BottomNav
          activeId="journey"
          items={[
            { id: 'journey', label: 'Journey', href: '/' },
            { id: 'history', label: 'History', href: '/history' },
            { id: 'profile', label: 'Profile', href: '/profile' },
          ]}
        />
      )}
    </main>
  );
}
