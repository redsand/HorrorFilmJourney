import { headers } from 'next/headers';
import { BottomNav, Card, LogoutIconButton } from '@/components/ui';
import { HistoryView } from '@/components/history/HistoryView';

type HistoryResponse = {
  items: Array<{
    interactionId: string;
    status: 'WATCHED' | 'ALREADY_SEEN' | 'SKIPPED' | 'WANT_TO_WATCH';
    rating: number | null;
    createdAt: string;
    movie: {
      tmdbId: number;
      title: string;
      year?: number;
      posterUrl: string | null;
    };
  }>;
};

type HistorySummaryResponse = {
  countsByStatus: {
    WATCHED: number;
    ALREADY_SEEN: number;
    SKIPPED: number;
    WANT_TO_WATCH: number;
  };
  avgRatingWatchedOrAlreadySeen: number | null;
  eraPreferences: Record<string, number>;
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

  return {
    ...(await response.json() as { data: T | null; error: unknown }),
    status: response.status,
  };
}

export default async function HistoryPage() {
  const [historyResponse, summaryResponse] = await Promise.all([
    apiJson<HistoryResponse>('/api/history?limit=100', { method: 'GET' }),
    apiJson<HistorySummaryResponse>('/api/history/summary', { method: 'GET' }),
  ]);

  const history = historyResponse.status === 200 ? historyResponse.data : null;
  const summary = summaryResponse.status === 200 ? summaryResponse.data : null;

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-16">

      {!history || !summary ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">Unable to load history. Please login first.</p>
        </Card>
      ) : (
        <HistoryView items={history.items} summary={summary} />
      )}

      <Card className="mt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">History</p>
          <LogoutIconButton />
        </div>
      </Card>

      <BottomNav
        activeId="history"
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
