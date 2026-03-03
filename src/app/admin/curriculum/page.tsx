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
  externalReadings: Array<{
    id: string;
    sourceName: string;
    articleTitle: string;
    url: string;
    sourceType: string;
  }>;
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
  titlesWithExternalLinks: number;
  externalLinkCoveragePct: number;
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
  externalLinksOps?: {
    coverageReport?: {
      seasonSlug: string;
      targetPct: number;
      overallCoveragePct: number;
      meetsTarget: boolean;
    };
    topViewedMissingExternalLinks?: Array<{
      movieId: string;
      tmdbId: number;
      title: string;
      views: number;
    }>;
  };
};

export default function AdminCurriculumPage() {
  type LinkEditorState = {
    loading?: boolean;
    saving?: boolean;
    error?: string | null;
    allowedSources?: Array<{ sourceName: string; domains: string[] }>;
    items?: Array<{ id: string; sourceName: string; articleTitle: string; url: string; sourceType: string; publicationDate?: string }>;
    sourceName?: string;
    articleTitle?: string;
    url?: string;
    sourceType?: 'review' | 'essay' | 'retrospective';
    publicationDate?: string;
    open?: boolean;
  };
  const [data, setData] = useState<CurriculumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorByMovieId, setEditorByMovieId] = useState<Record<string, LinkEditorState>>({});

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

  async function openEditor(movieId: string, seasonId: string): Promise<void> {
    setEditorByMovieId((prev) => ({
      ...prev,
      [movieId]: {
        loading: true,
        saving: false,
        error: null,
        allowedSources: prev[movieId]?.allowedSources ?? [],
        items: prev[movieId]?.items ?? [],
        sourceName: prev[movieId]?.sourceName ?? '',
        articleTitle: prev[movieId]?.articleTitle ?? '',
        url: prev[movieId]?.url ?? '',
        sourceType: prev[movieId]?.sourceType ?? 'retrospective',
        publicationDate: prev[movieId]?.publicationDate ?? '',
        open: true,
      },
    }));
    const response = await fetch(`/api/admin/curriculum/external-links?movieId=${movieId}&seasonId=${seasonId}`, {
      method: 'GET',
      credentials: 'include',
    });
    const payload = await response.json();
    if (!response.ok) {
      setEditorByMovieId((prev) => ({
        ...prev,
        [movieId]: {
          ...(prev[movieId] ?? {
            saving: false,
            allowedSources: [],
            items: [],
            sourceName: '',
            articleTitle: '',
            url: '',
            sourceType: 'retrospective' as const,
            publicationDate: '',
            open: true,
          }),
          loading: false,
          error: payload?.error?.message ?? 'Unable to load external links',
        },
      }));
      return;
    }
    const firstAllowedSource = payload?.data?.allowedSources?.[0]?.sourceName ?? '';
    setEditorByMovieId((prev) => ({
      ...prev,
      [movieId]: {
        ...(prev[movieId] ?? {
          saving: false,
          sourceName: '',
          articleTitle: '',
          url: '',
          sourceType: 'retrospective' as const,
          publicationDate: '',
        }),
        loading: false,
        error: null,
        open: true,
        allowedSources: Array.isArray(payload?.data?.allowedSources) ? payload.data.allowedSources : [],
        items: Array.isArray(payload?.data?.items) ? payload.data.items : [],
        sourceName: prev[movieId]?.sourceName || firstAllowedSource,
      },
    }));
  }

  async function saveExternalLink(movieId: string, seasonId: string): Promise<void> {
    const editor = editorByMovieId[movieId];
    if (!editor) {
      return;
    }
    if (!editor.sourceName || !editor.articleTitle || !editor.url) {
      setEditorByMovieId((prev) => ({
        ...prev,
        [movieId]: {
          ...editor,
          error: 'sourceName, articleTitle, and url are required',
        },
      }));
      return;
    }
    setEditorByMovieId((prev) => ({
      ...prev,
      [movieId]: {
        ...editor,
        saving: true,
        error: null,
      },
    }));
    const response = await fetch('/api/admin/curriculum/external-links', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        movieId,
        seasonId,
        sourceName: editor.sourceName,
        articleTitle: editor.articleTitle,
        url: editor.url,
        sourceType: editor.sourceType ?? 'retrospective',
        publicationDate: editor.publicationDate || undefined,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setEditorByMovieId((prev) => ({
        ...prev,
        [movieId]: {
          ...editor,
          saving: false,
          error: payload?.error?.message ?? 'Unable to save external link',
          open: true,
        },
      }));
      return;
    }
    await openEditor(movieId, seasonId);
    setEditorByMovieId((prev) => ({
      ...prev,
      [movieId]: {
        ...(prev[movieId] ?? editor),
        saving: false,
        error: null,
        articleTitle: '',
        url: '',
        publicationDate: '',
      },
    }));
    await load();
  }

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

      {data?.externalLinksOps ? (
        <Card className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">External links ops</p>
          <p className="text-xs text-[var(--text-muted)]">
            Season {data.externalLinksOps.coverageReport?.seasonSlug ?? 'season-1'} coverage:
            {' '}
            <span className="text-[var(--text)]">
              {data.externalLinksOps.coverageReport?.overallCoveragePct ?? 0}%
            </span>
            {' '} / target {data.externalLinksOps.coverageReport?.targetPct ?? 80}%
          </p>
          {data.externalLinksOps.topViewedMissingExternalLinks?.length ? (
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Top viewed missing links</p>
              <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                {data.externalLinksOps.topViewedMissingExternalLinks.slice(0, 20).map((item) => (
                  <li key={item.movieId}>
                    {item.title} (TMDB {item.tmdbId}) · {item.views} views
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No missing links in top viewed titles.</p>
          )}
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
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    External links: {node.titlesWithExternalLinks}/{node.totalTitles} ({node.externalLinkCoveragePct}%)
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
                        <div className="mt-2 space-y-1">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">External Links</p>
                          {title.externalReadings.length > 0 ? (
                            <ul className="space-y-1 text-xs text-[var(--text-muted)]">
                              {title.externalReadings.slice(0, 5).map((link) => (
                                <li key={link.id} className="truncate">
                                  {link.sourceName} · {link.articleTitle}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-[var(--text-muted)]">No curated links yet.</p>
                          )}
                          <button
                            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
                            onClick={() => { void openEditor(title.id, season.id); }}
                            type="button"
                          >
                            {editorByMovieId[title.id]?.open ? 'Refresh Links' : 'Edit External Links'}
                          </button>
                          {editorByMovieId[title.id]?.open ? (
                            <div className="space-y-2 rounded-md border border-[var(--border)] bg-[rgba(0,0,0,0.25)] p-2">
                              {editorByMovieId[title.id]?.loading ? (
                                <p className="text-xs text-[var(--text-muted)]">Loading...</p>
                              ) : (
                                <>
                                  <select
                                    className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                                    onChange={(event) => {
                                      const value = event.currentTarget.value;
                                      setEditorByMovieId((prev) => ({
                                        ...prev,
                                        [title.id]: { ...prev[title.id], sourceName: value },
                                      }));
                                    }}
                                    value={editorByMovieId[title.id]?.sourceName ?? ''}
                                  >
                                    {(editorByMovieId[title.id]?.allowedSources ?? []).map((source) => (
                                      <option key={source.sourceName} value={source.sourceName}>{source.sourceName}</option>
                                    ))}
                                  </select>
                                  <input
                                    className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                                    onChange={(event) => {
                                      const value = event.currentTarget.value;
                                      setEditorByMovieId((prev) => ({
                                        ...prev,
                                        [title.id]: { ...prev[title.id], articleTitle: value },
                                      }));
                                    }}
                                    placeholder="Article title"
                                    value={editorByMovieId[title.id]?.articleTitle ?? ''}
                                  />
                                  <input
                                    className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                                    onChange={(event) => {
                                      const value = event.currentTarget.value;
                                      setEditorByMovieId((prev) => ({
                                        ...prev,
                                        [title.id]: { ...prev[title.id], url: value },
                                      }));
                                    }}
                                    placeholder="https://..."
                                    value={editorByMovieId[title.id]?.url ?? ''}
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <select
                                      className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                                      onChange={(event) => {
                                        const value = event.currentTarget.value as 'review' | 'essay' | 'retrospective';
                                        setEditorByMovieId((prev) => ({
                                          ...prev,
                                          [title.id]: { ...prev[title.id], sourceType: value },
                                        }));
                                      }}
                                      value={editorByMovieId[title.id]?.sourceType ?? 'retrospective'}
                                    >
                                      <option value="review">review</option>
                                      <option value="essay">essay</option>
                                      <option value="retrospective">retrospective</option>
                                    </select>
                                    <input
                                      className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                                      onChange={(event) => {
                                        const value = event.currentTarget.value;
                                        setEditorByMovieId((prev) => ({
                                          ...prev,
                                          [title.id]: { ...prev[title.id], publicationDate: value },
                                        }));
                                      }}
                                      placeholder="YYYY-MM-DDTHH:mm:ss.sssZ"
                                      value={editorByMovieId[title.id]?.publicationDate ?? ''}
                                    />
                                  </div>
                                  {editorByMovieId[title.id]?.error ? (
                                    <p className="text-xs text-[var(--accent)]">{editorByMovieId[title.id]?.error}</p>
                                  ) : null}
                                  <button
                                    className="rounded-md border border-[var(--cc-accent)] bg-[rgba(155,17,30,0.2)] px-2 py-1 text-xs"
                                    disabled={editorByMovieId[title.id]?.saving}
                                    onClick={() => { void saveExternalLink(title.id, season.id); }}
                                    type="button"
                                  >
                                    {editorByMovieId[title.id]?.saving ? 'Saving...' : 'Save Link'}
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
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
