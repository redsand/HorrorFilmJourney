'use client';

import { useMemo, useState } from 'react';
import { Card, Chip, PosterImage } from '@/components/ui';

type HistoryItem = {
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
};

type HistorySummary = {
  countsByStatus: {
    WATCHED: number;
    ALREADY_SEEN: number;
    SKIPPED: number;
    WANT_TO_WATCH: number;
  };
  avgRatingWatchedOrAlreadySeen: number | null;
  eraPreferences: Record<string, number>;
};

type HistoryViewProps = {
  items: HistoryItem[];
  summary: HistorySummary;
};

type FilterTab = 'SEEN' | 'SKIPPED' | 'WANT';

const tabLabels: Record<FilterTab, string> = {
  SEEN: 'Seen',
  SKIPPED: 'Skipped',
  WANT: 'Want',
};

function statusPill(status: HistoryItem['status']): string {
  if (status === 'WATCHED') return 'Watched';
  if (status === 'ALREADY_SEEN') return 'Already seen';
  if (status === 'SKIPPED') return 'Skipped';
  return 'Want to watch';
}

export function HistoryView({ items, summary }: HistoryViewProps) {
  const [tab, setTab] = useState<FilterTab>('SEEN');

  const filtered = useMemo(() => {
    if (tab === 'SEEN') {
      return items.filter((item) => item.status === 'WATCHED' || item.status === 'ALREADY_SEEN');
    }
    if (tab === 'SKIPPED') {
      return items.filter((item) => item.status === 'SKIPPED');
    }
    return items.filter((item) => item.status === 'WANT_TO_WATCH');
  }, [items, tab]);

  const topDecades = Object.entries(summary.eraPreferences).slice(0, 3);

  return (
    <section className="space-y-3">
      <Card>
        <h2 className="text-lg font-semibold">History Summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Chip>Watched {summary.countsByStatus.WATCHED}</Chip>
          <Chip>Already seen {summary.countsByStatus.ALREADY_SEEN}</Chip>
          <Chip>Skipped {summary.countsByStatus.SKIPPED}</Chip>
          <Chip>Want {summary.countsByStatus.WANT_TO_WATCH}</Chip>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Avg rating: {summary.avgRatingWatchedOrAlreadySeen ?? 'n/a'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {topDecades.length > 0
            ? topDecades.map(([decade, count]) => (
              <Chip key={decade}>{decade} ({count})</Chip>
            ))
            : <Chip>No decade data yet</Chip>}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(tabLabels) as FilterTab[]).map((key) => (
          <button
            className={`rounded-lg border px-3 py-2 text-sm ${tab === key ? 'border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)] text-[var(--text)]' : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}
            key={key}
            onClick={() => setTab(key)}
            type="button"
          >
            {tabLabels[key]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card>
            <p className="text-sm text-[var(--text-muted)]">No items for this filter yet.</p>
          </Card>
        )}
        {filtered.map((item) => (
          <Card className="p-3" key={item.interactionId}>
            <div className="flex gap-3">
              <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-[#141418]">
                <PosterImage
                  alt={`${item.movie.title} poster`}
                  className="object-cover"
                  fill
                  sizes="48px"
                  src={item.movie.posterUrl}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.movie.title}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {item.movie.year ?? 'Unknown year'} • {statusPill(item.status)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Rating: {item.rating ?? 'n/a'} • {new Date(item.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
