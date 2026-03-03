'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card, Chip, LogoutIconButton } from '@/components/ui';

type CurriculumNodeTitle = {
  id: string;
  rank: number;
  tmdbId: number;
  title: string;
  posterUrl: string;
  isEligible: boolean;
  missing: {
    poster: boolean;
    ratings: boolean;
    reception: boolean;
    credits: boolean;
  };
};

type CurriculumNode = {
  id: string;
  slug: string;
  name: string;
  orderIndex: number;
  totalTitles: number;
  eligibleTitles: number;
  missingPosterCount: number;
  missingRatingsCount: number;
  missingReceptionCount: number;
  missingCreditsCount: number;
  titles: CurriculumNodeTitle[];
};

type CurriculumPack = {
  id: string;
  slug: string;
  name: string;
  isEnabled: boolean;
  nodes: CurriculumNode[];
};

type CurriculumResponse = {
  activeSeason: { id: string; slug: string; name: string } | null;
  packs: CurriculumPack[];
};

export default function AdminCurriculumPage() {
  const [data, setData] = useState<CurriculumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    const response = await fetch('/api/admin/curriculum', {
      method: 'GET',
      credentials: 'include',
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload?.error?.message ?? 'Unable to load curriculum');
      setLoading(false);
      return;
    }
    setData(payload.data as CurriculumResponse);
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
            <p className="text-xs text-[var(--text-muted)]">Admin · Curriculum</p>
          </div>
          <LogoutIconButton />
        </div>
      </header>

      <Card className="space-y-3">
        <p className="text-sm text-[var(--text-muted)]">
          Curriculum coverage view for active season and enabled packs.
        </p>
        <div className="flex gap-2">
          <Link className="inline-flex" href="/admin/packs"><Button variant="secondary">Packs</Button></Link>
          <Link className="inline-flex" href="/admin/users"><Button variant="secondary">Users</Button></Link>
        </div>
      </Card>

      {loading ? <Card><p className="text-sm text-[var(--text-muted)]">Loading curriculum...</p></Card> : null}
      {error ? <Card><p className="text-sm text-[var(--accent)]">{error}</p></Card> : null}

      {data?.activeSeason ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">Active season</p>
          <p className="text-lg font-semibold">{data.activeSeason.name}</p>
          <p className="text-xs text-[var(--text-muted)]">{data.activeSeason.slug}</p>
        </Card>
      ) : null}

      {(data?.packs ?? []).map((pack) => (
        <Card className="space-y-3" key={pack.id}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{pack.name}</h2>
              <p className="text-xs text-[var(--text-muted)]">{pack.slug}</p>
            </div>
            <Chip tone={pack.isEnabled ? 'accent' : 'default'}>
              {pack.isEnabled ? 'Enabled' : 'Disabled'}
            </Chip>
          </div>
          <div className="space-y-3">
            {pack.nodes.map((node) => (
              <details className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3" key={node.id}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{node.orderIndex}. {node.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{node.slug}</p>
                    </div>
                    <Chip tone={node.eligibleTitles >= 8 ? 'accent' : 'default'}>
                      {node.eligibleTitles}/{node.totalTitles} eligible
                    </Chip>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Missing: poster {node.missingPosterCount} · ratings {node.missingRatingsCount} · reception {node.missingReceptionCount} · credits {node.missingCreditsCount}
                  </p>
                </summary>
                <div className="mt-3 space-y-2">
                  {node.titles.map((title) => (
                    <div className="flex gap-3 rounded-lg border border-[var(--border)] p-2" key={title.id}>
                      <div
                        className="h-16 w-12 shrink-0 rounded bg-[var(--bg)] bg-cover bg-center"
                        style={{ backgroundImage: `url(${title.posterUrl})` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{title.rank}. {title.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">TMDB {title.tmdbId}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {title.isEligible ? 'Eligible' : `Missing:${title.missing.poster ? ' poster' : ''}${title.missing.ratings ? ' ratings' : ''}${title.missing.reception ? ' reception' : ''}${title.missing.credits ? ' credits' : ''}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Card>
      ))}
    </main>
  );
}
