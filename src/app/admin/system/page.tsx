'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, LogoutIconButton } from '@/components/ui';

type SystemPayload = {
  errors: Array<{ id: string; route: string; code: string | null; message: string; requestId: string | null; userId: string | null; createdAt: string }>;
  feedback: Array<{ id: string; title: string; type: string; status: string; priority: string; route: string | null; createdAt: string; user: { id: string; displayName: string; email: string | null } }>;
  audits: Array<{ id: string; action: string; targetId: string | null; createdAt: string; userId: string }>;
  jobs: Array<unknown>;
};

export default function AdminSystemPage() {
  const [data, setData] = useState<SystemPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/admin/system', { method: 'GET', credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? 'Unable to load system page');
      } else {
        setData(payload.data as SystemPayload);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">CinemaCodex.com</h1>
            <p className="text-xs text-[var(--text-muted)]">Admin · System</p>
          </div>
          <LogoutIconButton />
        </div>
      </header>

      <Card className="space-y-2">
        <p className="text-sm text-[var(--text-muted)]">Operational visibility for launch.</p>
        <div className="flex gap-2">
          <Link href="/admin/users"><Button variant="secondary">Users</Button></Link>
          <Link href="/admin/feedback"><Button variant="secondary">Feedback</Button></Link>
          <Link href="/admin/packs"><Button variant="secondary">Packs</Button></Link>
        </div>
      </Card>

      {loading ? <Card><p className="text-sm text-[var(--text-muted)]">Loading...</p></Card> : null}
      {error ? <Card><p className="text-sm text-[var(--accent)]">{error}</p></Card> : null}

      <Card className="space-y-2">
        <h2 className="text-lg font-semibold">Recent Errors ({data?.errors.length ?? 0})</h2>
        {(data?.errors ?? []).slice(0, 20).map((entry) => (
          <div className="rounded border border-[var(--border)] p-2 text-xs" key={entry.id}>
            <p className="font-semibold">{entry.route} · {entry.code ?? 'UNKNOWN'}</p>
            <p className="text-[var(--text-muted)]">{entry.message}</p>
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-semibold">Recent Feedback ({data?.feedback.length ?? 0})</h2>
        {(data?.feedback ?? []).slice(0, 20).map((entry) => (
          <div className="rounded border border-[var(--border)] p-2 text-xs" key={entry.id}>
            <p className="font-semibold">{entry.title}</p>
            <p className="text-[var(--text-muted)]">{entry.type} · {entry.priority} · {entry.status}</p>
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-semibold">Recent Audit Events ({data?.audits.length ?? 0})</h2>
        {(data?.audits ?? []).slice(0, 20).map((entry) => (
          <div className="rounded border border-[var(--border)] p-2 text-xs" key={entry.id}>
            <p className="font-semibold">{entry.action}</p>
            <p className="text-[var(--text-muted)]">target={entry.targetId ?? 'n/a'} · by {entry.userId}</p>
          </div>
        ))}
      </Card>
    </main>
  );
}
