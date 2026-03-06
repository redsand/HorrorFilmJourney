'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Chip, LogoutIconButton } from '@/components/ui';

type FeedbackType = 'BUG' | 'IDEA' | 'CONFUSION' | 'OTHER';
type FeedbackStatus = 'OPEN' | 'IN_REVIEW' | 'FIXED' | 'ARCHIVED';
type FeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type FeedbackRow = {
  id: string;
  createdAt: string;
  type: FeedbackType;
  category: string | null;
  title: string;
  description: string;
  route: string | null;
  userAgent: string | null;
  appVersion: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  user: {
    id: string;
    displayName: string;
    email: string | null;
  };
};

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [priority, setPriority] = useState<string>('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  async function loadFeedback(cursor?: string, append = false): Promise<void> {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) {
        params.set('status', status);
      }
      if (type) {
        params.set('type', type);
      }
      if (priority) {
        params.set('priority', priority);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      if (cursor) {
        params.set('cursor', cursor);
      }
      params.set('limit', '25');
      const response = await fetch(`/api/admin/feedback?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? 'Unable to load feedback');
        return;
      }
      const nextItems = payload?.data?.items as FeedbackRow[];
      setItems((previous) => (append ? [...previous, ...nextItems] : nextItems));
      setNextCursor(payload?.data?.nextCursor ?? null);
      if (!append && nextItems.length > 0) {
        setSelectedId(nextItems[0]!.id);
      }
      setError(null);
    } catch {
      setError('Unable to load feedback');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFeedback(undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateSelected(patch: { status?: FeedbackStatus; priority?: FeedbackPriority }): Promise<void> {
    if (!selected) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/feedback/${selected.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError('Unable to update feedback');
        return;
      }
      const payload = await response.json();
      const nextStatus = payload?.data?.status as FeedbackStatus;
      const nextPriority = payload?.data?.priority as FeedbackPriority;
      setItems((previous) =>
        previous.map((item) =>
          item.id === selected.id
            ? {
              ...item,
              status: nextStatus ?? item.status,
              priority: nextPriority ?? item.priority,
            }
            : item,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">CinemaCodex.com</h1>
            <p className="text-xs text-[var(--text-muted)]">Admin · Feedback</p>
          </div>
          <LogoutIconButton />
        </div>
      </header>

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" onChange={(e) => setStatus(e.target.value)} value={status}>
            <option value="">All status</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_REVIEW">IN_REVIEW</option>
            <option value="FIXED">FIXED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
          <select className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" onChange={(e) => setType(e.target.value)} value={type}>
            <option value="">All types</option>
            <option value="BUG">BUG</option>
            <option value="IDEA">IDEA</option>
            <option value="CONFUSION">CONFUSION</option>
            <option value="OTHER">OTHER</option>
          </select>
          <select className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" onChange={(e) => setPriority(e.target.value)} value={priority}>
            <option value="">All priority</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <input
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title/description"
            value={search}
          />
        </div>
        <Button className="w-full" onClick={() => void loadFeedback(undefined, false)} type="button" variant="secondary">
          Apply Filters
        </Button>
      </Card>

      <Card className="space-y-2">
        <div className="mb-2 hidden grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[11px] uppercase tracking-wide text-[var(--text-muted)] sm:grid">
          <span>CreatedAt</span>
          <span>User / Type / Priority / Status / Title / Route</span>
        </div>
        {loading ? <p className="text-sm text-[var(--text-muted)]">Loading feedback...</p> : null}
        {error ? <p className="text-sm text-[#f88d95]">{error}</p> : null}
        {items.map((item) => (
          <button
            className={`w-full rounded-lg border p-3 text-left ${selectedId === item.id ? 'border-[rgba(193,18,31,0.65)] bg-[rgba(155,17,30,0.13)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]'}`}
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            type="button"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleString()}</p>
                <p className="mt-1 text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-[var(--text-muted)]">{item.user.email ?? item.user.displayName}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <Chip>{item.type}</Chip>
                <Chip tone={item.priority === 'HIGH' || item.priority === 'CRITICAL' ? 'accent' : 'default'}>{item.priority}</Chip>
                <Chip>{item.status}</Chip>
              </div>
            </div>
            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{item.route ?? '-'}</p>
          </button>
        ))}
        {nextCursor ? (
          <Button className="w-full" onClick={() => void loadFeedback(nextCursor, true)} type="button" variant="secondary">
            Load More
          </Button>
        ) : null}
      </Card>

      {selected ? (
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            <Link href="/admin/users">
              <Button type="button" variant="secondary">Users</Button>
            </Link>
          </div>
          <p className="text-sm leading-6 text-[var(--text)]">{selected.description}</p>
          <div className="space-y-1 text-xs text-[var(--text-muted)]">
            <p>User: {selected.user.displayName} ({selected.user.email ?? 'no-email'})</p>
            <p>Route: {selected.route ?? '-'}</p>
            <p>Category: {selected.category ?? '-'}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
              disabled={saving}
              onChange={(event) => void updateSelected({ status: event.target.value as FeedbackStatus })}
              value={selected.status}
            >
              <option value="OPEN">OPEN</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="FIXED">FIXED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
              disabled={saving}
              onChange={(event) => void updateSelected({ priority: event.target.value as FeedbackPriority })}
              value={selected.priority}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button disabled={saving} onClick={() => void updateSelected({ status: 'FIXED' })} type="button">Mark Fixed</Button>
            <Button disabled={saving} onClick={() => void updateSelected({ status: 'IN_REVIEW' })} type="button" variant="secondary">Mark In Review</Button>
            <Button disabled={saving} onClick={() => void updateSelected({ status: 'ARCHIVED' })} type="button" variant="secondary">Archive</Button>
          </div>
        </Card>
      ) : null}
    </main>
  );
}
