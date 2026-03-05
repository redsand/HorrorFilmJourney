import React from 'react';
import { Card, Chip } from '@/components/ui';
import type { SeasonReasonPanel } from '@/lib/context/build-season-reason-panel';

type ReasonPanelProps = SeasonReasonPanel;

function normalizeToPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const scaled = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function parseCurriculumFit(value: string): { ontologyPct: number; journeyPct: number } | null {
  const match = value.match(/([0-9]*\.?[0-9]+)\s*ontology\s*\/\s*([0-9]*\.?[0-9]+)\s*journey/i);
  if (!match) {
    return null;
  }
  const ontology = Number.parseFloat(match[1] ?? '');
  const journey = Number.parseFloat(match[2] ?? '');
  if (!Number.isFinite(ontology) || !Number.isFinite(journey)) {
    return null;
  }
  return {
    ontologyPct: normalizeToPercent(ontology),
    journeyPct: normalizeToPercent(journey),
  };
}

function CurriculumFitIconRow({ ontologyPct, journeyPct }: { ontologyPct: number; journeyPct: number }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <div className="rounded-md border border-[var(--border)] bg-[rgba(18,18,22,0.72)] px-2 py-2">
        <div className="flex items-center gap-1.5">
          <svg aria-hidden="true" className="h-3.5 w-3.5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24">
            <path d="M12 3 4 7v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V7l-8-4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
          <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Ontology</p>
        </div>
        <p className="mt-1 text-sm font-medium">{ontologyPct}%</p>
      </div>
      <div className="rounded-md border border-[var(--border)] bg-[rgba(18,18,22,0.72)] px-2 py-2">
        <div className="flex items-center gap-1.5">
          <svg aria-hidden="true" className="h-3.5 w-3.5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24">
            <path d="M12 3 19 7l-7 4-7-4 7-4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            <path d="M5 11l7 4 7-4M5 15l7 4 7-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
          <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Journey</p>
        </div>
        <p className="mt-1 text-sm font-medium">{journeyPct}%</p>
      </div>
    </div>
  );
}

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
  const curriculumFit = scoreBlock?.label === 'Curriculum Fit' && scoreBlock?.value
    ? parseCurriculumFit(scoreBlock.value)
    : null;
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
          {curriculumFit ? (
            <CurriculumFitIconRow ontologyPct={curriculumFit.ontologyPct} journeyPct={curriculumFit.journeyPct} />
          ) : (
            <p className="text-sm">{scoreBlock.value}</p>
          )}
          {scoreBlock.detail && !curriculumFit ? (
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
