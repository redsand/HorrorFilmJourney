import Link from 'next/link';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { MovieCardVM } from '@/contracts/movieCardVM';
import { JourneyMap, JourneyMasteryCard, RecommendationBundle, RefreshRecommendationsButton } from '@/components/journey';
import { CinematicContextCard } from '@/components/context/CinematicContextCard';
import { ReasonPanel } from '@/components/context/ReasonPanel';
import { BottomNav, Button, Card } from '@/components/ui';
import { getPackSubgenreOptions, MAX_SELECTED_SUBGENRES } from '@/lib/packs/subgenres';
import { getPackCopy } from '@/lib/packs/pack-copy';
import { buildFilmContextExplanation } from '@/lib/context/build-film-context-explanation';
import type { FilmContextExplanation } from '@/lib/context/build-film-context-explanation';
import { buildSeasonReasonPanel } from '@/lib/context/build-season-reason-panel';
import type { SeasonReasonPanel } from '@/lib/context/build-season-reason-panel';
import { resolveWatchReasonForFilm } from '@/lib/journey/watch-reason';

type ExperienceResponse = {
  state: 'PACK_SELECTION_NEEDED' | 'ONBOARDING_NEEDED' | 'SHOW_RECOMMENDATION_BUNDLE' | 'SHOW_QUICK_POLL' | 'SHOW_HISTORY';
  packSelection?: {
    activeSeason: { slug: string; name: string };
    packs: Array<{ slug: string; name: string; isEnabled: boolean; seasonSlug: string }>;
  };
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

type ProgressionResponse = {
  currentNode: string;
  masteryScore: number;
  completedCount: number;
  nextMilestone: number;
  unlockedThemes: string[];
};
type PacksResponse = {
  activeSeason: { slug: string; name: string };
  packs: Array<{ slug: string; name: string; isEnabled: boolean; seasonSlug: string }>;
};

type WatchlistResponse = {
  items: Array<{
    interactionId: string;
    createdAt: string;
    movie: {
      tmdbId: number;
      title: string;
      year: number | null;
      posterUrl: string;
    };
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  packSlug: string;
};

type NodeMoviesResponse = {
  nodeSlug: string;
  core: Array<{ tmdbId: number; title: string; year: number | null; watchReason?: string }>;
  extended: Array<{ tmdbId: number; title: string; year: number | null; watchReason?: string }>;
};
type JourneyMapResponse = {
  seasonSlug: string;
  packSlug: string;
  nodes: Array<{ slug: string; name: string; order: number; coreCount?: number; extendedCount?: number }>;
  progress?: { completedNodeSlugs: string[]; currentNodeSlug?: string };
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

  let payload: { data: T | null; error: { code: string; message: string } | null };
  try {
    payload = (await response.json()) as { data: T | null; error: { code: string; message: string } | null };
  } catch {
    payload = {
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'Invalid API response' },
    };
  }
  return { ...payload, status: response.status };
}

async function submitOnboarding(formData: FormData): Promise<void> {
  'use server';
  const tolerance = Number(formData.get('tolerance'));
  const pacePreference = String(formData.get('pacePreference') ?? 'balanced');
  const selectedPackSlug = String(formData.get('selectedPackSlug') ?? 'horror');
  const selectedSubgenres = formData.getAll('selectedSubgenres')
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .slice(0, MAX_SELECTED_SUBGENRES);

  const onboardingResponse = await apiJson('/api/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tolerance, pacePreference, selectedPackSlug, selectedSubgenres, horrorDNA: {} }),
  });
  if (onboardingResponse.status === 200) {
    await apiJson('/api/recommendations/next', {
      method: 'POST',
    });
  }
  revalidatePath('/');
}

async function submitPackSelection(formData: FormData): Promise<void> {
  'use server';
  const selectedPackSlug = String(formData.get('selectedPackSlug') ?? 'horror');
  await apiJson('/api/profile/select-pack', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ packSlug: selectedPackSlug }),
  });
  revalidatePath('/');
}

export default async function HomePage({ searchParams }: { searchParams?: { watchlistPage?: string; nodeSlug?: string } }) {
  const experienceResponse = await apiJson<ExperienceResponse>('/api/experience', { method: 'GET' });
  const experience = experienceResponse.status === 200 ? experienceResponse.data : null;
  const unauthenticated = experienceResponse.status === 401;
  const watchlistPageRaw = Number.parseInt(searchParams?.watchlistPage ?? '1', 10);
  const watchlistPage = Number.isInteger(watchlistPageRaw) && watchlistPageRaw > 0 ? watchlistPageRaw : 1;
  const progression = !unauthenticated
    ? (await apiJson<ProgressionResponse>('/api/profile/progression', { method: 'GET' })).data
    : null;
  const packs = !unauthenticated
    ? (await apiJson<PacksResponse>('/api/packs', { method: 'GET' })).data
    : null;
  const watchlist = !unauthenticated
    ? (await apiJson<WatchlistResponse>(`/api/watchlist?page=${watchlistPage}&pageSize=6`, { method: 'GET' })).data
    : null;
  const requestedNodeSlug = searchParams?.nodeSlug?.trim() ?? '';
  const activeJourneyNodeSlug = (
    requestedNodeSlug.length > 0
      ? requestedNodeSlug
      : (((experience?.bundle?.journeyNode ?? '').split('#')[0]) ?? '')
  ).toLowerCase();
  const nodeMovies = (!unauthenticated && activeJourneyNodeSlug)
    ? (await apiJson<NodeMoviesResponse>(`/api/journey/node-movies?nodeSlug=${encodeURIComponent(activeJourneyNodeSlug)}&limit=12`, { method: 'GET' })).data
    : null;
  const journeyMap = !unauthenticated
    ? (await apiJson<JourneyMapResponse>('/api/journey/map', { method: 'GET' })).data
    : null;
  const selectedPackSlug = watchlist?.packSlug
    ?? packs?.packs.find((pack) => pack.isEnabled)?.slug
    ?? 'horror';
  const selectedSeasonSlug = packs?.packs.find((pack) => pack.slug === selectedPackSlug)?.seasonSlug
    ?? packs?.activeSeason.slug
    ?? 'season-1';
  const compactContextTmdbIds = nodeMovies
    ? [...nodeMovies.core.slice(0, 2), ...nodeMovies.extended.slice(0, 1)].map((entry) => entry.tmdbId)
    : [];
  const compactContextRows = await Promise.all(compactContextTmdbIds.map(async (tmdbId) => {
    const [context, reasonPanel] = await Promise.all([
      buildFilmContextExplanation({
        seasonSlug: selectedSeasonSlug,
        packSlug: selectedPackSlug,
        nodeSlug: nodeMovies?.nodeSlug ?? null,
        tmdbId,
      }),
      buildSeasonReasonPanel({
        seasonSlug: selectedSeasonSlug,
        packSlug: selectedPackSlug,
        nodeSlug: nodeMovies?.nodeSlug ?? null,
        tmdbId,
      }),
    ]);
    return { tmdbId, context, reasonPanel };
  }));
  const compactContextByTmdbId = new Map<number, FilmContextExplanation>();
  const compactReasonByTmdbId = new Map<number, SeasonReasonPanel>();
  for (const row of compactContextRows) {
    if (row.context) {
      compactContextByTmdbId.set(row.tmdbId, row.context);
    }
    if (row.reasonPanel) {
      compactReasonByTmdbId.set(row.tmdbId, row.reasonPanel);
    }
  }
  const onboardingPackSlug = packs?.packs.find((pack) => pack.isEnabled)?.slug ?? 'horror';
  const onboardingSubgenres = getPackSubgenreOptions(onboardingPackSlug);
  const onboardingPackCopy = getPackCopy(onboardingPackSlug);
  const hasWatchedAtLeastOne = (progression?.completedCount ?? 0) > 0;

  let recommendations: RecommendationResponse | null = null;
  if (!unauthenticated && (experience?.state === 'SHOW_RECOMMENDATION_BUNDLE' || experience?.state === 'SHOW_QUICK_POLL')) {
    const mappedCards = (experience.bundle?.cards ?? [])
      .map((card) => toMovieCardFromExperienceCard(card, experience.bundle?.journeyNode))
      .filter((card): card is MovieCardVM => card !== null);
    const cardsWithWatchReason = await Promise.all(mappedCards.map(async (card) => {
      const watchReason = await resolveWatchReasonForFilm({
        seasonSlug: selectedSeasonSlug,
        packSlug: selectedPackSlug,
        nodeSlug: activeJourneyNodeSlug || null,
        tmdbId: card.movie.tmdbId,
      });
      return watchReason
        ? {
          ...card,
          codex: {
            ...card.codex,
            watchReason,
          },
        }
        : card;
    }));
    if (mappedCards.length > 0) {
      recommendations = {
        batchId: experience.bundle?.id ?? 'current',
        cards: cardsWithWatchReason,
        interactionContext: (experience.bundle?.cards ?? []).map((card) => ({
          tmdbId: card.movie.tmdbId,
          recommendationItemId: card.id,
        })),
      };
    }
  }

  if (unauthenticated) {
    return (
      <main className="flex flex-1 flex-col gap-4 pb-8 pt-4">
        <header className="rounded-2xl border border-[var(--border)] bg-[rgba(12,12,16,0.85)] p-5 shadow-[0_12px_34px_rgba(0,0,0,0.45)]">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">CinemaCodex.com</p>
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
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-16">
      {journeyMap && experience?.state !== 'ONBOARDING_NEEDED' && experience?.state !== 'PACK_SELECTION_NEEDED' ? (
        <Card>
          <JourneyMap
            baseHref="/journey"
            currentNodeSlug={activeJourneyNodeSlug}
            data={journeyMap}
            packSlug={journeyMap.packSlug ?? selectedPackSlug}
            seasonSlug={journeyMap.seasonSlug ?? selectedSeasonSlug}
          />
        </Card>
      ) : null}

      {experience?.state === 'PACK_SELECTION_NEEDED' && (
        <Card>
          <h2 className="text-lg font-semibold">Select Your Pack</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Choose your active pack to start Season 1.
          </p>
          <form action={submitPackSelection} className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                {experience.packSelection?.activeSeason.name ?? 'Season 1'}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {(experience.packSelection?.packs ?? []).filter((pack) => pack.isEnabled).map((pack, index) => (
                  <label key={pack.slug} className="cursor-pointer">
                    <input
                      className="peer sr-only"
                      defaultChecked={index === 0}
                      name="selectedPackSlug"
                      type="radio"
                      value={pack.slug}
                    />
                    <span className="block rounded-lg border border-[var(--border)] px-3 py-2 text-sm peer-checked:border-[rgba(193,18,31,0.7)] peer-checked:bg-[rgba(155,17,30,0.22)]">
                      {pack.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full py-3 text-base" type="submit">
              {onboardingPackCopy.startSeasonLabel}
            </Button>
          </form>
        </Card>
      )}

      {experience?.state === 'ONBOARDING_NEEDED' && (
        <Card>
          <h2 className="text-lg font-semibold">Onboarding</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {onboardingPackCopy.onboardingIntro}
          </p>
          <form action={submitOnboarding} className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">{onboardingPackCopy.onboardingIntensityLabel}</p>
              <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">
                {onboardingPackCopy.onboardingIntensityHint}
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
              {packs?.packs?.length ? (
                <>
                  <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Pack ({packs.activeSeason.name})
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {packs.packs.filter((pack) => pack.isEnabled).map((pack, index) => (
                      <label key={pack.slug} className="cursor-pointer">
                        <input
                          className="peer sr-only"
                          defaultChecked={index === 0}
                          name="selectedPackSlug"
                          type="radio"
                          value={pack.slug}
                        />
                        <span className="block rounded-lg border border-[var(--border)] px-3 py-2 text-sm peer-checked:border-[rgba(193,18,31,0.7)] peer-checked:bg-[rgba(155,17,30,0.22)]">
                          {pack.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">{onboardingPackCopy.onboardingPaceLabel}</p>
              <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">
                {onboardingPackCopy.onboardingPaceHint}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {onboardingPackCopy.onboardingPaceOptions.map((item) => (
                  <label key={item.id} className="cursor-pointer">
                    <input className="peer sr-only" type="radio" name="pacePreference" value={item.id} defaultChecked={item.id === 'balanced'} />
                    <span className="block rounded-lg border border-[var(--border)] px-2 py-2 text-center text-sm peer-checked:border-[rgba(193,18,31,0.7)] peer-checked:bg-[rgba(155,17,30,0.22)]">
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                {onboardingPackCopy.onboardingSubgenreLabel} (choose up to {MAX_SELECTED_SUBGENRES})
              </p>
              <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">
                {onboardingPackCopy.onboardingSubgenreHint}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {onboardingSubgenres.map((subgenre, index) => (
                  <label key={subgenre} className="cursor-pointer">
                    <input
                      className="peer sr-only"
                      defaultChecked={index < 2}
                      name="selectedSubgenres"
                      type="checkbox"
                      value={subgenre}
                    />
                    <span className="block rounded-lg border border-[var(--border)] px-2 py-2 text-center text-sm peer-checked:border-[rgba(193,18,31,0.7)] peer-checked:bg-[rgba(155,17,30,0.22)]">
                      {subgenre}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full py-3 text-base" type="submit">
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path d="M5 4h12l2 2v14H5V4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                <path d="M8 4v6h8V4M9 16h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
              Save Preferences
            </Button>
          </form>
        </Card>
      )}

      {(experience?.state === 'SHOW_RECOMMENDATION_BUNDLE' || experience?.state === 'SHOW_QUICK_POLL') && (
        <section className="space-y-4" id="recommendations-panel">
          {experience.state === 'SHOW_QUICK_POLL' && hasWatchedAtLeastOne && (
            <Card>
              <h2 className="text-lg font-semibold">Quick poll ready</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {experience.quickPoll?.prompt ?? 'Give quick feedback on your latest choice, then continue your journey.'}
              </p>
              <Link
                className="mt-3 inline-flex text-sm text-[var(--text)] underline-offset-2 hover:underline"
                href="#recommendations-panel"
              >
                Go to recommendations
              </Link>
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
          {nodeMovies ? (
            <Card>
              <h2 className="text-lg font-semibold">Core Journey Picks</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{nodeMovies.nodeSlug}</p>
              {nodeMovies.core.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {nodeMovies.core.slice(0, 8).map((movie) => (
                    <li className="text-sm" key={`core-${movie.tmdbId}`}>
                      <Link
                        className="cc-link-muted inline-flex items-center gap-1.5 no-underline underline-offset-2 hover:underline"
                        href={`/companion/${movie.tmdbId}?spoilerPolicy=NO_SPOILERS`}
                      >
                        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                          <path d="M12 3 4 7v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V7l-8-4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                          <path d="M9.5 12.5 11 14l3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                        </svg>
                        {movie.title} {movie.year ? `(${movie.year})` : ''}
                      </Link>
                      {movie.watchReason ? (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">{movie.watchReason}</p>
                      ) : null}
                      <div className="mt-2">
                        <CinematicContextCard compact data={compactContextByTmdbId.get(movie.tmdbId) ?? null} />
                        {compactReasonByTmdbId.get(movie.tmdbId) ? (
                          <div className="mt-2">
                            <ReasonPanel {...compactReasonByTmdbId.get(movie.tmdbId)!} />
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[var(--text-muted)]">No core titles available for this node.</p>
              )}
              {nodeMovies.extended.length > 0 ? (
                <details className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
                  <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Deep Cuts ({nodeMovies.extended.length})
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {nodeMovies.extended.slice(0, 8).map((movie) => (
                      <li
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[rgba(18,18,22,0.7)] px-2 py-1.5 text-sm text-[var(--text-muted)]"
                        key={`extended-${movie.tmdbId}`}
                      >
                        <Link
                          className="min-w-0 truncate text-[var(--text)] underline-offset-2 hover:underline"
                          href={`/companion/${movie.tmdbId}?spoilerPolicy=NO_SPOILERS`}
                        >
                          {movie.title} {movie.year ? `(${movie.year})` : ''}
                        </Link>
                        {movie.watchReason ? (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{movie.watchReason}</p>
                        ) : null}
                        <div className="w-full">
                          <CinematicContextCard compact data={compactContextByTmdbId.get(movie.tmdbId) ?? null} />
                          {compactReasonByTmdbId.get(movie.tmdbId) ? (
                            <div className="mt-2">
                              <ReasonPanel {...compactReasonByTmdbId.get(movie.tmdbId)!} />
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Card>
          ) : null}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Watchlist</h2>
              <p className="text-xs text-[var(--text-muted)]">
                {watchlist?.total ?? 0} saved
              </p>
            </div>
            {watchlist?.items?.length ? (
              <div className="mt-3 space-y-2">
                {watchlist.items.map((item) => (
                  <Link
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                    href={`/companion/${item.movie.tmdbId}?spoilerPolicy=NO_SPOILERS`}
                    key={item.interactionId}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text)]">{item.movie.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {item.movie.year ?? 'Unknown year'} • Added {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">Open</span>
                  </Link>
                ))}
                <div className="mt-2 flex items-center justify-between">
                  <Link
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      (watchlist.page ?? 1) <= 1
                        ? 'pointer-events-none border-[var(--border)] text-[var(--text-muted)] opacity-50'
                        : 'border-[var(--border)] text-[var(--text)]'
                    }`}
                    href={`/journey?watchlistPage=${Math.max(1, (watchlist.page ?? 1) - 1)}`}
                  >
                    Prev
                  </Link>
                  <p className="text-xs text-[var(--text-muted)]">
                    Page {watchlist.page} / {watchlist.totalPages}
                  </p>
                  <Link
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      (watchlist.page ?? 1) >= (watchlist.totalPages ?? 1)
                        ? 'pointer-events-none border-[var(--border)] text-[var(--text-muted)] opacity-50'
                        : 'border-[var(--border)] text-[var(--text)]'
                    }`}
                    href={`/journey?watchlistPage=${Math.min((watchlist.totalPages ?? 1), (watchlist.page ?? 1) + 1)}`}
                  >
                    Next
                  </Link>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Your watchlist is empty. Use Search to add titles from your selected season.
              </p>
            )}
          </Card>
        </section>
      )}

      {experience?.state === 'SHOW_HISTORY' && (
        <Card>
          <h2 className="text-lg font-semibold">History Ready</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">You&apos;ve completed enough actions to review your timeline.</p>
          <Link className="mt-4 inline-flex" href="/history">
            <Button>
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path d="M12 8v5l3 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              Open History
            </Button>
          </Link>
        </Card>
      )}

      {experience?.state !== 'ONBOARDING_NEEDED' && experience?.state !== 'PACK_SELECTION_NEEDED' && (
        <JourneyMasteryCard initialProgression={progression} />
      )}

      {experience?.state !== 'ONBOARDING_NEEDED' && experience?.state !== 'PACK_SELECTION_NEEDED' && (
        <BottomNav
          activeId="journey"
          items={[
            { id: 'journey', label: 'Journey', href: '/journey' },
            { id: 'history', label: 'History', href: '/history' },
            { id: 'profile', label: 'Profile', href: '/profile' },
            { id: 'search', label: 'Search', href: '/search' },
          ]}
        />
      )}
    </main>
  );
}
