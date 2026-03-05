import React from 'react';
import Link from 'next/link';

export type NextInJourneyData = {
  nextCore: Array<{ tmdbId: number; title: string; year: number | null }>;
  nextExtended: Array<{ tmdbId: number; title: string; year: number | null }>;
  reason: string;
};

type NextInJourneyProps = {
  data: NextInJourneyData | null;
  plain?: boolean;
};

export function NextInJourney({ data, plain = false }: NextInJourneyProps) {
  if (!data || (data.nextCore.length === 0 && data.nextExtended.length === 0)) {
    return null;
  }

  return (
    <section className={plain ? 'space-y-2 pt-3' : 'space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3'}>
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Next in this Journey</p>
      <p className="text-sm text-[var(--text-muted)]">{data.reason}</p>
      {data.nextCore.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Core</p>
          <ul className="mt-1 space-y-1">
            {data.nextCore.map((film) => (
              <li key={`core-${film.tmdbId}`}>
                <Link
                  className="text-sm text-[var(--text)] underline-offset-2 hover:underline"
                  href={`/companion/${film.tmdbId}?spoilerPolicy=NO_SPOILERS`}
                >
                  {film.title} {film.year ? `(${film.year})` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.nextExtended.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Deep Cuts</p>
          <ul className="mt-1 space-y-1">
            {data.nextExtended.map((film) => (
              <li key={`extended-${film.tmdbId}`}>
                <Link
                  className="text-sm text-[var(--text)] underline-offset-2 hover:underline"
                  href={`/companion/${film.tmdbId}?spoilerPolicy=NO_SPOILERS`}
                >
                  {film.title} {film.year ? `(${film.year})` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
