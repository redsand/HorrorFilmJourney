'use client';

import { useState } from 'react';
import { QuickPoll } from '@/components/journey/QuickPoll';
import { Button, Card } from '@/components/ui';

type PollStatus = 'WATCHED' | 'ALREADY_SEEN';

export function CompanionActions({
  tmdbId,
  title,
  seasonSlug,
}: {
  tmdbId: number;
  title: string;
  seasonSlug?: string | null;
}) {
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [skipPending, setSkipPending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: Record<string, unknown>): Promise<void> {
    const response = await fetch('/api/interactions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error('Unable to save interaction.');
    }
  }

  return (
    <>
      <Card className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Track this movie</p>
        <div className="grid grid-cols-1 gap-2">
          <Button
            className="min-h-11 text-base"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setPollStatus('WATCHED');
            }}
            type="button"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7-11-7Z" fill="currentColor" />
            </svg>
            Watched
          </Button>
          <Button
            className="min-h-11 text-base"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setPollStatus('ALREADY_SEEN');
            }}
            type="button"
            variant="secondary"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
              <path d="M9 12.75 11.5 15 16 9.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Already seen
          </Button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--text-muted)]"
            disabled={skipPending}
            onClick={async () => {
              setSkipPending(true);
              setError(null);
              setSuccess(null);
              try {
                await submit({ tmdbId, status: 'SKIPPED' });
                setSuccess('Marked as skipped. Removed from watchlist if it was saved.');
              } catch {
                setError('Unable to save interaction.');
              } finally {
                setSkipPending(false);
              }
            }}
            type="button"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
              <path d="M4 6h16M7 6v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6M10 10v6M14 10v6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
            {skipPending ? 'Saving…' : 'Skip'}
          </button>
        </div>
        {success ? <p className="text-xs text-[var(--text-muted)]">{success}</p> : null}
        {error ? <p className="text-xs text-[var(--cc-danger)]">{error}</p> : null}
      </Card>

      <QuickPoll
        onClose={() => setPollStatus(null)}
        onSubmit={async (payload) => {
          if (!pollStatus) {
            return;
          }
          await submit({
            tmdbId,
            status: pollStatus,
            ...payload,
          });
          setSuccess(`Saved as ${pollStatus === 'WATCHED' ? 'watched' : 'already seen'}. Removed from watchlist if it was saved.`);
          setError(null);
        }}
        open={pollStatus !== null}
        seasonSlug={seasonSlug}
        status={pollStatus ?? 'WATCHED'}
        title={title}
      />
    </>
  );
}
