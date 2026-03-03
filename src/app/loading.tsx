export default function GlobalLoading() {
  return (
    <main className="flex min-h-screen flex-1 flex-col bg-[var(--bg)] px-4 pb-24 pt-16">
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[0_12px_34px_rgba(0,0,0,0.45)]">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">CinemaCodex.com</p>
        <h1 className="mt-2 text-xl font-semibold">Preparing your journey...</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          We are loading your profile and generating recommendations in the background.
        </p>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[rgba(193,18,31,0.72)]" />
        </div>
      </div>
    </main>
  );
}
