import { headers } from 'next/headers';
import { BottomNav, Card } from '@/components/ui';
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
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <h1 className="text-xl font-semibold">Horror Codex</h1>
        <p className="text-xs text-[var(--text-muted)]">History</p>
      </header>

      {!history || !summary ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">Unable to load history. Please login first.</p>
        </Card>
      ) : (
        <HistoryView items={history.items} summary={summary} />
      )}

      <BottomNav
        activeId="history"
        items={[
          { id: 'journey', label: 'Journey', href: '/' },
          { id: 'history', label: 'History', href: '/history' },
          { id: 'profile', label: 'Profile', href: '/profile' },
        ]}
      />
    </main>
  );
}
