import Link from 'next/link';
import { headers } from 'next/headers';
import { BottomNav, Card, Chip, PosterImage, RatingBadges } from '@/components/ui';

type SpoilerPolicy = 'NO_SPOILERS' | 'LIGHT' | 'FULL';

type CompanionResponse = {
  movie: {
    tmdbId: number;
    title: string;
    year?: number;
    posterUrl: string;
  };
  credits: {
    director?: string;
    cast: Array<{ name: string; role?: string }>;
  };
  sections: {
    productionNotes: string[];
    historicalNotes: string[];
    receptionNotes: string[];
    trivia: string[];
  };
  ratings: Array<{
    source: string;
    value: number;
    scale: '10' | '100' | string;
    rawValue?: string;
  }>;
  spoilerPolicy: SpoilerPolicy;
};

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
  searchParams?: { spoilerPolicy?: SpoilerPolicy };
}) {
  const tmdbId = Number.parseInt(params.tmdbId, 10);
  const spoilerPolicy: SpoilerPolicy = searchParams?.spoilerPolicy ?? 'NO_SPOILERS';

  let payload: CompanionResponse | null = null;
  if (Number.isInteger(tmdbId)) {
    const response = await apiJson<CompanionResponse>(`/api/companion?tmdbId=${tmdbId}&spoilerPolicy=${spoilerPolicy}`, { method: 'GET' });
    payload = response.status === 200 ? response.data : null;
  }

  const spoilerTabs: SpoilerPolicy[] = ['NO_SPOILERS', 'LIGHT', 'FULL'];

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <h1 className="text-xl font-semibold">Horror Codex</h1>
        <p className="text-xs text-[var(--text-muted)]">Companion Mode</p>
      </header>

      {!payload ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">Companion data unavailable.</p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[16/9] w-full bg-[#111116]">
              <PosterImage
                alt={`${payload.movie.title} poster`}
                className="object-cover"
                fill
                sizes="(max-width: 420px) 100vw, 420px"
                src={payload.movie.posterUrl}
              />
            </div>
            <div className="space-y-3 p-4">
              <div>
                <h2 className="text-2xl font-semibold">{payload.movie.title}</h2>
                <p className="text-sm text-[var(--text-muted)]">{payload.movie.year ?? 'Unknown year'}</p>
              </div>
              <div>
                <Chip tone="accent">{spoilerPolicyLabel[spoilerPolicy]}</Chip>
              </div>

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Ratings</p>
                <RatingBadges ratings={payload.ratings} />
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

              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  spoilerPolicy === 'FULL'
                    ? 'border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)] text-[var(--text)]'
                    : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                }`}
              >
                {spoilerPolicyWarning[spoilerPolicy]}
              </div>

              <div className="space-y-2 text-base">
                <p><span className="text-[var(--text-muted)]">Director:</span> {payload.credits.director ?? 'Unknown'}</p>
                <div className="flex flex-wrap gap-2">
                  {payload.credits.cast.length > 0
                    ? payload.credits.cast.map((item) => <Chip key={`${item.name}-${item.role ?? ''}`}>{item.name}{item.role ? ` • ${item.role}` : ''}</Chip>)
                    : <Chip>No cast metadata</Chip>}
                </div>
              </div>
            </div>
          </Card>

          {[
            { title: 'Production', lines: payload.sections.productionNotes },
            { title: 'Historical', lines: payload.sections.historicalNotes },
            { title: 'Reception', lines: payload.sections.receptionNotes },
            { title: 'Trivia', lines: payload.sections.trivia },
          ].map((section) => (
            <Card key={section.title}>
              <h3 className="text-lg font-semibold">{section.title}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-relaxed">
                {section.lines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </Card>
          ))}
        </>
      )}

      <BottomNav
        activeId="journey"
        items={[
          { id: 'journey', label: 'Journey', href: '/' },
          { id: 'history', label: 'History', href: '/history' },
          { id: 'profile', label: 'Profile', href: '/profile' },
        ]}
      />
    </main>
  );
}
