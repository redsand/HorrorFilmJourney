import Link from 'next/link';
import { headers } from 'next/headers';
import { CompanionActions } from '@/components/companion/CompanionActions';
import { FurtherReadingSection } from '@/components/companion/FurtherReadingSection';
import { CinematicContextCard } from '@/components/context/CinematicContextCard';
import { ReasonPanel } from '@/components/context/ReasonPanel';
import { JourneyMap, NextInJourney } from '@/components/journey';
import { BottomNav, Card, Chip, LogoutIconButton, PosterImage, RatingBadges } from '@/components/ui';
import type { ExternalReading } from '@/lib/contracts/companion-contract';
import type { FilmContextExplanation } from '@/lib/context/build-film-context-explanation';
import type { SeasonReasonPanel } from '@/lib/context/build-season-reason-panel';

type SpoilerPolicy = 'NO_SPOILERS' | 'LIGHT' | 'FULL';
type MeResponse = {
  role: 'ADMIN' | 'USER';
};

type CompanionResponse = {
  movie: {
    tmdbId: number;
    title: string;
    year?: number;
    posterUrl: string;
  };
  metadata: {
    genres: string[];
    nodes: Array<{ slug: string; label: string; rationale: string }>;
    runtimeText: string;
    countries: string[];
    languages: string[];
    tagline?: string;
    overview?: string;
    popularity?: number;
    tmdbVoteAverage?: number;
    tmdbVoteCount?: number;
  };
  credits: {
    director?: string;
    cast: Array<{ name: string; role?: string }>;
  };
  sections: {
    productionNotes: string[];
    historicalNotes: string[];
    receptionNotes: string[];
    techniqueBreakdown: string[];
    influenceMap: string[];
    afterWatchingReflection: string[];
    trivia: string[];
  };
  ratings: Array<{
    source: string;
    value: number;
    scale: '10' | '100' | string;
    rawValue?: string;
  }>;
  streaming: {
    region: string;
    offers: Array<{
      provider: string;
      type: 'subscription' | 'rent' | 'buy' | 'free';
      url?: string;
      price?: string;
    }>;
  };
  spoilerPolicy: SpoilerPolicy;
  evidence: Array<{ sourceName: string; url: string; snippet: string; retrievedAt: string }>;
  externalReadings?: ExternalReading[];
};

type NodeMoviesResponse = {
  nodeSlug: string;
  core: Array<{ tmdbId: number; title: string; year: number | null; watchReason?: string }>;
  extended: Array<{ tmdbId: number; title: string; year: number | null; watchReason?: string }>;
};
type FilmContextApiPayload = {
  context: FilmContextExplanation | null;
  reasonPanel: SeasonReasonPanel | null;
};
type JourneyMapResponse = {
  seasonSlug: string;
  packSlug: string;
  nodes: Array<{ slug: string; name: string; order: number; coreCount?: number; extendedCount?: number }>;
  progress?: { completedNodeSlugs: string[]; currentNodeSlug?: string };
};
type NextInJourneyResponse = {
  nextCore: Array<{ tmdbId: number; title: string; year: number | null }>;
  nextExtended: Array<{ tmdbId: number; title: string; year: number | null }>;
  reason: string;
} | null;

const spoilerPolicyLabel: Record<SpoilerPolicy, string> = {
  NO_SPOILERS: 'No Spoilers!',
  LIGHT: 'Light Spoilers',
  FULL: 'Full Spoilers',
};

const spoilerPolicyWarning: Record<SpoilerPolicy, string> = {
  NO_SPOILERS: 'Spoiler-safe mode: avoids ending and major reveals.',
  LIGHT: 'Light spoilers mode: includes beginning and middle details only.',
  FULL: 'Full spoilers mode: includes ending and major reveals.',
};

const SUMMARY_PREFIXES = [
  'Spoiler-safe summary:',
  'Act I-II summary:',
  'Full plot summary (includes ending):',
];

function extractSummaryLine(lines: string[]): string | null {
  return lines.find((line) => SUMMARY_PREFIXES.some((prefix) => line.startsWith(prefix))) ?? null;
}

function stripSummaryPrefix(line: string): string {
  for (const prefix of SUMMARY_PREFIXES) {
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim();
    }
  }
  return line.trim();
}

function toSummaryBullets(summaryText: string): string[] {
  return summaryText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 5);
}

function getOrigin(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: unknown; status: number }> {
  const h = new Headers(init?.headers);
  const cookie = headers().get('cookie');
  if (cookie) {
    h.set('cookie', cookie);
  }
  const response = await fetch(`${getOrigin()}${path}`, {
    cache: 'no-store',
    ...init,
    headers: h,
  });
  return { ...(await response.json() as { data: T | null; error: unknown }), status: response.status };
}

export default async function CompanionPage({
  params,
  searchParams,
}: {
  params: { tmdbId: string };
  searchParams?: { spoilerPolicy?: SpoilerPolicy; forceRefresh?: string };
}) {
  const tmdbId = Number.parseInt(params.tmdbId, 10);
  const spoilerPolicy: SpoilerPolicy = searchParams?.spoilerPolicy ?? 'NO_SPOILERS';
  const forceRefresh = searchParams?.forceRefresh === 'true' || searchParams?.forceRefresh === '1';

  let payload: CompanionResponse | null = null;
  let isAdmin = false;
  if (Number.isInteger(tmdbId)) {
    const [meResponse, response] = await Promise.all([
      apiJson<MeResponse>('/api/auth/me', { method: 'GET' }),
      apiJson<CompanionResponse>(
        `/api/companion?tmdbId=${tmdbId}&spoilerPolicy=${spoilerPolicy}${forceRefresh ? '&forceRefresh=true' : ''}`,
        { method: 'GET' },
      ),
    ]);
    isAdmin = meResponse.status === 200 && meResponse.data?.role === 'ADMIN';
    payload = response.status === 200 ? response.data : null;
  }
  const primaryNodeSlug = payload?.metadata.nodes?.[0]?.slug ?? '';
  const [nodeMovies, filmContext, journeyMap, nextInJourney] = payload
    ? await Promise.all([
      primaryNodeSlug
        ? apiJson<NodeMoviesResponse>(`/api/journey/node-movies?nodeSlug=${encodeURIComponent(primaryNodeSlug)}&limit=10`, { method: 'GET' })
        : Promise.resolve({ data: null, error: null, status: 200 }),
      apiJson<FilmContextApiPayload>(
        `/api/films/context?tmdbId=${payload.movie.tmdbId}${primaryNodeSlug ? `&nodeSlug=${encodeURIComponent(primaryNodeSlug)}` : ''}`,
        { method: 'GET' },
      ),
      apiJson<JourneyMapResponse>('/api/journey/map', { method: 'GET' }),
      apiJson<NextInJourneyResponse>(`/api/journey/next-steps?tmdbId=${payload.movie.tmdbId}`, { method: 'GET' }),
    ])
    : [
      { data: null, error: null, status: 200 },
      { data: null, error: null, status: 200 },
      { data: null, error: null, status: 200 },
      { data: null, error: null, status: 200 },
    ];

  const spoilerTabs: SpoilerPolicy[] = ['NO_SPOILERS', 'LIGHT', 'FULL'];
  const summaryLine = payload ? extractSummaryLine(payload.sections.productionNotes) : null;
  const summaryBullets = summaryLine ? toSummaryBullets(stripSummaryPrefix(summaryLine)) : [];

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-16">

      {!payload ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">Companion data unavailable.</p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[2/3] w-full bg-[#111116]">
              <PosterImage
                alt={`${payload.movie.title} poster`}
                className="object-contain"
                fill
                sizes="(max-width: 420px) 100vw, 420px"
                src={payload.movie.posterUrl}
              />
            </div>
            <div className="space-y-5 p-4 leading-relaxed">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-2xl font-semibold">{payload.movie.title}</h2>
                  <p className="text-sm text-[var(--text-muted)]">{payload.movie.year ?? 'Unknown year'}</p>
                </div>
                {payload.metadata.tagline ? (
                  <p className="mt-1 text-sm italic text-[var(--text-muted)]">&ldquo;{payload.metadata.tagline}&rdquo;</p>
                ) : null}
              </div>

              <div>
                <RatingBadges ratings={payload.ratings} />
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Where to watch</p>
                <div className="flex flex-wrap gap-2">
                  {payload.streaming.offers.length > 0 ? (
                    payload.streaming.offers.slice(0, 8).map((offer) => (
                      <Chip key={`${offer.provider}-${offer.type}-${offer.price ?? ''}`}>
                        {offer.provider}
                        {offer.type ? ` • ${offer.type}` : ''}
                        {offer.price ? ` • ${offer.price}` : ''}
                      </Chip>
                    ))
                  ) : (
                    <Chip>No streaming availability cached for {payload.streaming.region}.</Chip>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">SUBGENRE(S)</p>
                <div className="flex flex-wrap gap-2">
                  {payload.metadata.nodes.length > 0
                    ? payload.metadata.nodes.map((node) => <Chip key={node.slug}>{node.label}</Chip>)
                    : payload.metadata.genres.length > 0
                      ? payload.metadata.genres.map((genre) => <Chip key={genre}>{genre}</Chip>)
                      : <Chip>Genres unavailable</Chip>}
                </div>
                {payload.metadata.nodes.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--text-muted)]">
                    {payload.metadata.nodes.slice(0, 3).map((node) => (
                      <li key={`rationale-${node.slug}`}>{node.label}: {node.rationale}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-4 text-xs uppercase tracking-wide text-[var(--text-muted)]">Movie details</p>
                <div className="grid grid-cols-1 gap-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  <p><span className="text-[var(--text)]">Runtime:</span> {payload.metadata.runtimeText}</p>
                  <p><span className="text-[var(--text)]">Languages:</span> {payload.metadata.languages.length > 0 ? payload.metadata.languages.join(', ') : 'Unknown'}</p>
                  <p><span className="text-[var(--text)]">Countries:</span> {payload.metadata.countries.length > 0 ? payload.metadata.countries.join(', ') : 'Unknown'}</p>
                  {typeof payload.metadata.popularity === 'number' ? (
                    <p><span className="text-[var(--text)]">Popularity:</span> {payload.metadata.popularity}</p>
                  ) : null}
                  {typeof payload.metadata.tmdbVoteAverage === 'number' ? (
                    <p>
                      <span className="text-[var(--text)]">TMDB:</span> {payload.metadata.tmdbVoteAverage}/10
                      {typeof payload.metadata.tmdbVoteCount === 'number' ? ` (${payload.metadata.tmdbVoteCount.toLocaleString()} votes)` : ''}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {spoilerTabs.map((tab) => (
                  <Link
                    className={`rounded-lg border px-3 py-2 text-center text-xs ${spoilerPolicy === tab ? 'border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)] text-[var(--text)]' : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}
                    href={`/companion/${payload.movie.tmdbId}?spoilerPolicy=${tab}`}
                    key={tab}
                  >
                    {spoilerPolicyLabel[tab]}
                  </Link>
                ))}
              </div>

              {isAdmin ? (
                <div className="flex justify-end">
                  <Link
                    className="inline-flex items-center gap-2 rounded-lg border border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.2)] px-3 py-2 text-xs text-[var(--text)]"
                    href={`/companion/${payload.movie.tmdbId}?spoilerPolicy=${spoilerPolicy}&forceRefresh=true`}
                    title="Admin: force refresh companion cache and regenerate"
                  >
                    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <path d="M4 4v6h6M20 20v-6h-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      <path d="M20 10a8 8 0 00-13.66-5.66L4 6m16 12-2.34 1.66A8 8 0 014 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                    </svg>
                    Force Refresh
                  </Link>
                </div>
              ) : null}

              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  spoilerPolicy === 'FULL'
                    ? 'border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)] text-[var(--text)]'
                    : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                }`}
              >
                {spoilerPolicyWarning[spoilerPolicy]}
              </div>

              {summaryBullets.length > 0 ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{spoilerPolicyLabel[spoilerPolicy]} Summary</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                    {summaryBullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-2.5 text-sm leading-relaxed">
                <p><span className="text-[var(--text-muted)]">Director:</span> {payload.credits.director ?? 'Unknown'}</p>
                <div className="flex flex-wrap gap-2">
                  {payload.credits.cast.length > 0
                    ? payload.credits.cast.map((item) => <Chip key={`${item.name}-${item.role ?? ''}`}>{item.name}{item.role ? ` • ${item.role}` : ''}</Chip>)
                    : <Chip>No cast metadata</Chip>}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Sources</p>
                {payload.evidence.length > 0 ? (
                  <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
                    {payload.evidence.slice(0, 5).map((item) => (
                      <li key={`${item.sourceName}-${item.url}`}>
                        <span className="font-medium">{item.sourceName}</span>
                        {item.snippet ? `: ${item.snippet}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">No evidence packets available for this title.</p>
                )}
              </div>

              <FurtherReadingSection externalReadings={payload.externalReadings} />
              <CinematicContextCard data={filmContext.data?.context ?? null} />
              {filmContext.data?.reasonPanel ? (
                <ReasonPanel {...filmContext.data.reasonPanel} />
              ) : null}
              {journeyMap.data && filmContext.data?.context ? (
                <JourneyMap
                  baseHref="/journey"
                  currentNodeSlug={primaryNodeSlug}
                  data={journeyMap.data}
                  packSlug={journeyMap.data.packSlug}
                  seasonSlug={journeyMap.data.seasonSlug}
                />
              ) : null}
              <NextInJourney data={nextInJourney.data} />

              {nodeMovies.data ? (
                <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Core Journey</p>
                  {nodeMovies.data.core.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {nodeMovies.data.core.slice(0, 6).map((movie) => (
                        <li key={`core-${movie.tmdbId}`}>
                          {movie.title} {movie.year ? `(${movie.year})` : ''}
                          {movie.watchReason ? (
                            <p className="text-xs text-[var(--text-muted)]">{movie.watchReason}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">No core titles available.</p>
                  )}
                  {nodeMovies.data.extended.length > 0 ? (
                    <details className="rounded border border-[var(--border)] px-2 py-1">
                      <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--text-muted)]">
                        Deep Cuts ({nodeMovies.data.extended.length})
                      </summary>
                      <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
                        {nodeMovies.data.extended.slice(0, 6).map((movie) => (
                          <li key={`extended-${movie.tmdbId}`}>
                            {movie.title} {movie.year ? `(${movie.year})` : ''}
                            {movie.watchReason ? (
                              <p className="text-xs text-[var(--text-muted)]">{movie.watchReason}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>

          {[ 
            {
              title: 'Production',
              lines: payload.sections.productionNotes.filter((line) => !SUMMARY_PREFIXES.some((prefix) => line.startsWith(prefix))),
            },
            { title: 'Historical', lines: payload.sections.historicalNotes },
            { title: 'Reception', lines: payload.sections.receptionNotes },
            { title: 'Technique Breakdown', lines: payload.sections.techniqueBreakdown },
            { title: 'Influence Map', lines: payload.sections.influenceMap },
            { title: 'After Watching Reflection', lines: payload.sections.afterWatchingReflection },
            { title: 'Trivia', lines: payload.sections.trivia },
          ].map((section) => (
            <Card className="border-[rgba(255,255,255,0.16)] bg-[rgba(12,12,16,0.92)]" key={section.title}>
              <h3 className="text-sm font-semibold tracking-tight">{section.title}</h3>
              <ul className="mt-3 list-disc space-y-2.5 pl-5 text-sm leading-relaxed">
                {section.lines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </Card>
          ))}

          <CompanionActions tmdbId={payload.movie.tmdbId} title={payload.movie.title} />
        </>
      )}

      <Card className="mt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Companion Mode</p>
          <LogoutIconButton />
        </div>
      </Card>

      <BottomNav
        activeId="journey"
        items={[
          { id: 'journey', label: 'Journey', href: '/journey' },
          { id: 'history', label: 'History', href: '/history' },
          { id: 'profile', label: 'Profile', href: '/profile' },
          { id: 'search', label: 'Search', href: '/search' },
        ]}
      />
    </main>
  );
}
