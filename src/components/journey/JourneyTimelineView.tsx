import Link from 'next/link';
import { Card, Chip } from '@/components/ui';

type JourneyTimelineNode = {
  slug: string;
  name: string;
  order: number;
  coreCount?: number;
  extendedCount?: number;
};

type JourneyTimelineData = {
  seasonSlug: string;
  packSlug: string;
  nodes: JourneyTimelineNode[];
  progress?: {
    completedNodeSlugs: string[];
    currentNodeSlug?: string;
  };
};

type JourneyTimelineViewProps = {
  data: JourneyTimelineData | null;
  currentNodeSlug?: string | null;
  baseHref?: string;
};

function normalizeSlug(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function JourneyTimelineView({
  data,
  currentNodeSlug,
  baseHref = '/journey',
}: JourneyTimelineViewProps) {
  if (!data || data.nodes.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">Journey map is not available yet.</p>
      </Card>
    );
  }

  const selected = normalizeSlug(currentNodeSlug ?? data.progress?.currentNodeSlug);
  const completed = new Set((data.progress?.completedNodeSlugs ?? []).map((slug) => normalizeSlug(slug)));
  const totalNodes = data.nodes.length;
  const completedNodes = completed.size;
  const progressPct = Math.max(0, Math.min(100, Math.round((completedNodes / Math.max(1, totalNodes)) * 100)));

  return (
    <section className="space-y-4" aria-label={`Journey timeline for ${data.seasonSlug}/${data.packSlug}`}>
      <Card className="relative space-y-3 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#a71f2b,#d97706,#16a34a)]" />
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Journey Timeline</p>
        <p className="text-sm text-[var(--text-muted)]">{data.seasonSlug}/{data.packSlug}</p>
        <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.1)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#a71f2b,#16a34a)] transition-all duration-700 ease-out"
            style={{ width: `${Math.max(6, progressPct)}%` }}
          />
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {completedNodes} of {totalNodes} movements completed
        </p>
      </Card>

      <ol className="relative space-y-3 pl-6" role="list">
        <div className="pointer-events-none absolute bottom-0 left-2 top-1 w-px bg-[linear-gradient(180deg,rgba(167,31,43,0.8),rgba(255,255,255,0.16))]" />
        {data.nodes.map((node) => {
          const slug = normalizeSlug(node.slug);
          const isCurrent = slug === selected;
          const isCompleted = completed.has(slug);
          const statusLabel = isCurrent ? 'Current' : isCompleted ? 'Completed' : 'Upcoming';
          const href = `${baseHref}?nodeSlug=${encodeURIComponent(node.slug)}`;
          return (
            <li key={node.slug} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-[22px] top-5 h-3 w-3 rounded-full border ${
                  isCurrent
                    ? 'border-[rgba(193,18,31,0.9)] bg-[rgba(193,18,31,0.92)]'
                    : isCompleted
                      ? 'border-[rgba(22,163,74,0.9)] bg-[rgba(22,163,74,0.92)]'
                      : 'border-[rgba(255,255,255,0.35)] bg-[rgba(14,14,20,0.9)]'
                }`}
              />
              <Link
                href={href}
                aria-current={isCurrent ? 'step' : undefined}
                className={`block rounded-xl border px-3 py-3 no-underline transition ${
                  isCurrent
                    ? 'border-[rgba(193,18,31,0.75)] bg-[linear-gradient(135deg,rgba(155,17,30,0.28),rgba(20,20,28,0.92))]'
                    : isCompleted
                      ? 'border-[rgba(22,163,74,0.55)] bg-[linear-gradient(135deg,rgba(15,90,45,0.2),rgba(20,20,28,0.9))]'
                      : 'border-[var(--border)] bg-[linear-gradient(135deg,rgba(25,25,32,0.75),rgba(18,18,24,0.88))]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{node.order}. {node.name}</p>
                  <Chip tone={isCurrent ? 'accent' : 'default'}>{statusLabel}</Chip>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                  <span>{node.coreCount ?? 0} core</span>
                  <span>{node.extendedCount ?? 0} extended</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
