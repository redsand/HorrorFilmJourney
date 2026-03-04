import React from 'react';
import Link from 'next/link';

export type JourneyMapNodeItem = {
  slug: string;
  name: string;
  order: number;
  coreCount?: number;
  extendedCount?: number;
};

export type JourneyMapData = {
  nodes: JourneyMapNodeItem[];
  progress?: {
    completedNodeSlugs: string[];
    currentNodeSlug?: string;
  };
};

type JourneyMapProps = {
  seasonSlug: string;
  packSlug: string;
  currentNodeSlug?: string | null;
  data: JourneyMapData | null;
  baseHref?: string;
};

export function JourneyMap({
  seasonSlug,
  packSlug,
  currentNodeSlug,
  data,
  baseHref = '/journey',
}: JourneyMapProps) {
  if (!data || data.nodes.length === 0) {
    return null;
  }
  const selectedSlug = (currentNodeSlug ?? data.progress?.currentNodeSlug ?? '').trim().toLowerCase();
  const completed = new Set((data.progress?.completedNodeSlugs ?? []).map((slug) => slug.toLowerCase()));

  return (
    <section aria-label={`Journey map for ${seasonSlug}/${packSlug}`} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Journey Map</p>
        <p className="text-xs text-[var(--text-muted)]">{seasonSlug}/{packSlug}</p>
      </div>
      <ol className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1" role="list">
        {data.nodes.map((node) => {
          const isCurrent = node.slug.toLowerCase() === selectedSlug;
          const isCompleted = completed.has(node.slug.toLowerCase());
          const href = `${baseHref}?nodeSlug=${encodeURIComponent(node.slug)}`;
          return (
            <li className="min-w-[180px] snap-start" key={node.slug}>
              <Link
                aria-current={isCurrent ? 'step' : undefined}
                className={`block rounded-lg border px-3 py-2 no-underline ${
                  isCurrent
                    ? 'border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)]'
                    : isCompleted
                      ? 'border-[rgba(22,163,74,0.6)] bg-[rgba(22,163,74,0.12)]'
                      : 'border-[var(--border)] bg-[var(--bg-elevated)]'
                }`}
                href={href}
              >
                <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                  {node.order}. {isCompleted ? 'Completed' : isCurrent ? 'Current' : 'Upcoming'}
                </p>
                <p className="mt-1 text-sm font-medium">{node.name}</p>
                {(typeof node.coreCount === 'number' || typeof node.extendedCount === 'number') ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {(node.coreCount ?? 0)} core / {(node.extendedCount ?? 0)} extended
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
