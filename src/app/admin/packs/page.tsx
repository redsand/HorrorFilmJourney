'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, LogoutIconButton } from '@/components/ui';

type Pack = {
  id: string;
  slug: string;
  name: string;
  isEnabled: boolean;
  primaryGenre: string;
  description: string | null;
};

type Season = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  packs: Pack[];
};

type AdminPacksResponse = {
  activeSeason: Season | null;
  seasons: Season[];
};

export default function AdminPacksPage() {
  const [data, setData] = useState<AdminPacksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    const response = await fetch('/api/admin/packs', { method: 'GET', credentials: 'include' });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload?.error?.message ?? 'Unable to load packs');
      setLoading(false);
      return;
    }
    setData(payload.data as AdminPacksResponse);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">CinemaCodex.com</h1>
            <p className="text-xs text-[var(--text-muted)]">Admin · Packs</p>
          </div>
          <LogoutIconButton />
        </div>
      </header>

      <Card>
        <p className="text-sm text-[var(--text-muted)]">
          Launch mode: Season 1 with Horror enabled. Keep at least one enabled pack in the active season.
        </p>
        <div className="mt-3 flex gap-2">
          <Link className="inline-flex" href="/admin/users">
            <Button variant="secondary">Users</Button>
          </Link>
          <Link className="inline-flex" href="/admin/curriculum">
            <Button variant="secondary">Curriculum</Button>
          </Link>
        </div>
      </Card>

      {loading ? <Card><p className="text-sm text-[var(--text-muted)]">Loading packs...</p></Card> : null}
      {error ? <Card><p className="text-sm text-[var(--accent)]">{error}</p></Card> : null}

      {(data?.seasons ?? []).map((season) => (
        <Card className="space-y-3" key={season.id}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{season.name}</h2>
              <p className="text-xs text-[var(--text-muted)]">{season.slug}</p>
            </div>
            <Button
              disabled={season.isActive}
              onClick={async () => {
                const response = await fetch('/api/admin/packs', {
                  method: 'PATCH',
                  credentials: 'include',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ seasonId: season.id }),
                });
                if (response.ok) {
                  await load();
                }
              }}
              type="button"
              variant={season.isActive ? 'secondary' : 'default'}
            >
              {season.isActive ? 'Active' : 'Set Active'}
            </Button>
          </div>

          <div className="space-y-2">
            {season.packs.map((pack) => (
              <div className="rounded-lg border border-[var(--border)] p-3" key={pack.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{pack.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{pack.slug} · {pack.primaryGenre}</p>
                  </div>
                  <Button
                    onClick={async () => {
                      const response = await fetch(`/api/admin/packs/${pack.id}`, {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ isEnabled: !pack.isEnabled }),
                      });
                      if (response.ok) {
                        await load();
                        return;
                      }
                      const payload = await response.json();
                      setError(payload?.error?.message ?? 'Unable to update pack');
                    }}
                    type="button"
                    variant={pack.isEnabled ? 'secondary' : 'default'}
                  >
                    {pack.isEnabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
                {pack.description ? (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{pack.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </main>
  );
}
