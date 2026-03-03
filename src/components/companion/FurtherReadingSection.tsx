import React from 'react';
import { Chip } from '@/components/ui';
import type { ExternalReading } from '@/lib/contracts/companion-contract';

type FurtherReadingSectionProps = {
  externalReadings?: ExternalReading[];
};

export function FurtherReadingSection({ externalReadings }: FurtherReadingSectionProps) {
  if (!externalReadings || externalReadings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Further Reading</p>
      <ul className="space-y-2">
        {externalReadings.slice(0, 8).map((item) => (
          <li className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" key={`${item.url}-${item.articleTitle}`}>
            <div className="flex items-center gap-2">
              <Chip className="shrink-0">{item.sourceName}</Chip>
              <a
                className="inline-flex min-w-0 items-center gap-1 text-sm text-[var(--cc-link)] underline underline-offset-2"
                href={item.url}
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                <span className="truncate">{item.articleTitle}</span>
                <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
                  <path d="M14 5h5v5M10 14 19 5M19 13v6H5V5h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
