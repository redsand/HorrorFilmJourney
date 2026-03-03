import { Card } from '@/components/ui';

export default function CompanionLoading() {
  const steps = [
    'Loading movie metadata and poster',
    'Fetching cast, director, and ratings',
    'Building spoiler-policy sections',
    'Generating trivia and final companion notes',
  ];

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--bg)] px-4">
      <Card className="w-full max-w-[420px] p-5 shadow-[0_12px_34px_rgba(0,0,0,0.45)]">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">CinemaCodex.com</p>
        <h1 className="mt-2 text-xl font-semibold">Loading companion mode...</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          We are loading cast, ratings, and spoiler-policy sections for this movie.
        </p>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[rgba(193,18,31,0.72)]" />
        </div>
        <ol className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
          {steps.map((step, idx) => (
            <li className="flex items-center gap-2" key={step}>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-xs text-[var(--text)]">
                {idx + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </main>
  );
}
