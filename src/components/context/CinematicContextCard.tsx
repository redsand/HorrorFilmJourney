import React from 'react';
import { Card, Chip } from '@/components/ui';
import type { FilmContextExplanation } from '@/lib/context/build-film-context-explanation';

type CinematicContextCardProps = {
  data: FilmContextExplanation | null;
  compact?: boolean;
  asSection?: boolean;
  sectionTone?: 'framed' | 'plain';
};

export function CinematicContextCard({
  data,
  compact = false,
  asSection = false,
  sectionTone = 'framed',
}: CinematicContextCardProps) {
  if (!data) {
    return null;
  }

  const titleClassName = compact ? 'text-sm font-semibold' : 'text-base font-semibold';
  const paragraphClassName = compact ? 'text-xs text-[var(--text-muted)]' : 'text-sm text-[var(--text-muted)]';

  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={titleClassName}>Cinematic Context</p>
        <div className="flex items-center gap-2">
          <Chip>{data.nodeName}</Chip>
          <Chip>{data.tier}</Chip>
        </div>
      </div>
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {data.title}
        {typeof data.year === 'number' ? ` (${data.year})` : ''}
      </p>
      <p className={paragraphClassName}>{data.whyParagraph}</p>
    </>
  );

  return asSection
    ? (
      <section className={
        sectionTone === 'plain'
          ? (compact ? 'space-y-2 pt-3' : 'space-y-3 pt-3')
          : (compact ? 'space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3' : 'space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3')
      }>
        {content}
      </section>
    )
    : (
      <Card className={compact ? 'space-y-2 p-3' : 'space-y-3'}>
        {content}
      </Card>
    );
}
