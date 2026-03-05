import React from 'react';
import { Card, Chip } from '@/components/ui';
import type { SeasonReasonPanel } from '@/lib/context/build-season-reason-panel';

type ReasonPanelProps = SeasonReasonPanel;

export function ReasonPanel({
  seasonSlug,
  reasonTitle,
  bullets,
  badges,
  scoreBlock,
  links,
  asSection = false,
  sectionTone = 'framed',
}: ReasonPanelProps & { asSection?: boolean; sectionTone?: 'framed' | 'plain' }) {
  const hasLinks = Array.isArray(links) && links.length > 0;
  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold">{reasonTitle}</p>
        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{seasonSlug}</p>
      </div>
      {badges.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {badges.map((badge) => <Chip key={badge}>{badge}</Chip>)}
        </div>
      ) : null}
      {scoreBlock ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{scoreBlock.label}</p>
          <p className="text-sm">{scoreBlock.value}</p>
          {scoreBlock.detail ? (
            <p className="text-xs text-[var(--text-muted)]">{scoreBlock.detail}</p>
          ) : null}
        </div>
      ) : null}
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        {bullets.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {hasLinks ? (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">References</p>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                className="text-xs text-[var(--text)] underline-offset-2 hover:underline"
                href={link.href}
                key={`${link.label}:${link.href}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );

  return asSection
    ? (
      <section className={sectionTone === 'plain' ? 'space-y-3 pt-3' : 'space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3'}>
        {content}
      </section>
    )
    : (
      <Card className="space-y-3">
        {content}
      </Card>
    );
}
