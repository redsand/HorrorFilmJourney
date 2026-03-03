'use client';

import { useEffect, useMemo, useState } from 'react';
import { BottomNav, Button, Card, LogoutIconButton, PosterImage } from '@/components/ui';

type SearchItem = {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  inWatchlist: boolean;
};

type SearchResponse = {
  data: {
    items: SearchItem[];
    packSlug: string;
  } | null;
  error: { code: string; message: string } | null;
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTmdbId, setSelectedTmdbId] = useState<number | null>(null);
  const [watchlistPending, setWatchlistPending] = useState<Set<number>>(new Set());

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setItems([]);
      setError(null);
      return;
    }

    let active = true;
    const timeout = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const response = await fetch(`/api/search/movies?q=${encodeURIComponent(trimmed)}&limit=10`, {
            method: 'GET',
            credentials: 'include',
          });
          const payload = (await response.json()) as SearchResponse;
          if (!active) {
            return;
          }
          if (!response.ok || payload.error) {
            setError(payload.error?.message ?? 'Unable to search movies.');
            setItems([]);
            return;
          }
          setError(null);
          setItems(payload.data?.items ?? []);
        } catch {
          if (active) {
            setError('Unable to search movies.');
            setItems([]);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  const typeahead = useMemo(
    () => items.slice(0, 6),
    [items],
  );

  async function addToWatchlist(tmdbId: number): Promise<void> {
    setWatchlistPending((current) => new Set([...current, tmdbId]));
    try {
      const response = await fetch('/api/interactions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tmdbId, status: 'WANT_TO_WATCH' }),
      });
      if (!response.ok) {
        return;
      }
      setItems((current) => current.map((item) => (
        item.tmdbId === tmdbId ? { ...item, inWatchlist: true } : item
      )));
    } finally {
      setWatchlistPending((current) => {
        const next = new Set(current);
        next.delete(tmdbId);
        return next;
      });
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-16">
      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Season Search</p>
        <label className="block">
          <span className="sr-only">Search movies in current season</span>
          <input
            autoComplete="off"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--cc-accent)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles in this season..."
            type="text"
            value={query}
          />
        </label>
        {query.trim().length >= 2 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[rgba(10,10,12,0.86)] p-2">
            {loading ? (
              <p className="px-1 py-1 text-xs text-[var(--text-muted)]">Searching...</p>
            ) : typeahead.length > 0 ? (
              <ul className="space-y-1">
                {typeahead.map((item) => (
                  <li key={`typeahead-${item.tmdbId}`}>
                    <button
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                        selectedTmdbId === item.tmdbId
                          ? 'bg-[rgba(155,17,30,0.22)] text-[var(--text)]'
                          : 'text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)]'
                      }`}
                      onClick={() => {
                        setSelectedTmdbId(item.tmdbId);
                        setQuery(item.title);
                      }}
                      type="button"
                    >
                      {item.title} {item.year ? `(${item.year})` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 py-1 text-xs text-[var(--text-muted)]">No matches in this season.</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">Type at least 2 letters to search.</p>
        )}
        {error ? <p className="text-xs text-[var(--cc-danger)]">{error}</p> : null}
      </Card>

      {items.map((item) => (
        <Card className="p-3" key={item.tmdbId}>
          <div className="flex items-center gap-3">
            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-[#111116]">
              <PosterImage
                alt={`${item.title} poster`}
                className="object-cover"
                fill
                sizes="48px"
                src={item.posterUrl}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text)]">{item.title}</p>
              <p className="text-xs text-[var(--text-muted)]">{item.year ?? 'Unknown year'}</p>
            </div>
            <Button
              className="min-h-9 px-3 py-2 text-xs"
              disabled={item.inWatchlist || watchlistPending.has(item.tmdbId)}
              onClick={() => void addToWatchlist(item.tmdbId)}
              type="button"
              variant={item.inWatchlist ? 'secondary' : 'primary'}
            >
              {!item.inWatchlist && !watchlistPending.has(item.tmdbId) ? (
                <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
                </svg>
              ) : null}
              {item.inWatchlist ? 'Saved' : watchlistPending.has(item.tmdbId) ? 'Saving...' : 'Watchlist'}
            </Button>
          </div>
        </Card>
      ))}

      <Card className="mt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Search</p>
          <LogoutIconButton />
        </div>
      </Card>

      <BottomNav
        activeId="search"
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
