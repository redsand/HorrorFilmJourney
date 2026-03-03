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
  completenessTier: 'ENRICHED' | 'BASIC';
  missing: {
    poster: boolean;
    ratings: boolean;
    reception: boolean;
    credits: boolean;
    streaming: boolean;
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
  missingStreamingCount: number;
  eligibilityCoverage: number;
  titles: CurriculumNodeTitle[];
};

type CurriculumPack = {
  id: string;
  slug: string;
  name: string;
  isEnabled: boolean;
  totalAssignedTitles: number;
  duplicateTitlesCount: number;
  duplicateRatePct: number;
  duplicateTmdbIds: number[];
  nodes: CurriculumNode[];
};

type CurriculumResponse = {
  activeSeason: { id: string; slug: string; name: string } | null;
  seasons?: Array<{
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
    packs: CurriculumPack[];
  }>;
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

      {(data?.seasons ?? []).map((season) => (
        <Card className="space-y-3" key={season.id}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{season.name}</h2>
              <p className="text-xs text-[var(--text-muted)]">{season.slug}</p>
            </div>
            <Chip tone={season.isActive ? 'accent' : 'default'}>
              {season.isActive ? 'Active' : 'Inactive'}
            </Chip>
          </div>
          {season.packs.map((pack) => (
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
          {!pack.isEnabled ? (
            <div className="rounded-lg border border-[rgba(255,165,0,0.45)] bg-[rgba(255,165,0,0.08)] px-3 py-2 text-xs text-[var(--text-muted)]">
              Pack disabled — not visible to users.
            </div>
          ) : null}
          <p className="text-xs text-[var(--text-muted)]">
            Coverage: {pack.totalAssignedTitles} assigned · duplicates {pack.duplicateTitlesCount} ({pack.duplicateRatePct}%)
          </p>
          {pack.duplicateTitlesCount > 0 ? (
            <p className="text-xs text-[var(--accent)]">
              Duplicate TMDB IDs across nodes: {pack.duplicateTmdbIds.slice(0, 12).join(', ')}
              {pack.duplicateTmdbIds.length > 12 ? ' …' : ''}
            </p>
          ) : null}
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
                      {node.eligibleTitles}/{node.totalTitles} eligible ({node.eligibilityCoverage}%)
                    </Chip>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Missing: poster {node.missingPosterCount} · ratings {node.missingRatingsCount} · reception {node.missingReceptionCount} · credits {node.missingCreditsCount} · streaming {node.missingStreamingCount}
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
                        <p className="text-xs text-[var(--text-muted)]">{title.completenessTier}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {title.isEligible
                            ? 'Eligible'
                            : `Missing:${title.missing.poster ? ' poster' : ''}${title.missing.ratings ? ' ratings' : ''}${title.missing.reception ? ' reception' : ''}${title.missing.credits ? ' credits' : ''}${title.missing.streaming ? ' streaming' : ''}`}
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
        </Card>
      ))}
    </main>
  );
}
