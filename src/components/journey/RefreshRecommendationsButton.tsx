'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';

type RefreshRecommendationsButtonProps = {
  label: string;
};

export function RefreshRecommendationsButton({ label }: RefreshRecommendationsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = isSubmitting || isPending;

  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setIsSubmitting(true);
          try {
            const response = await fetch('/api/recommendations/next', {
              method: 'POST',
              credentials: 'include',
            });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
              setError(payload?.error?.message ?? 'Unable to refresh recommendations.');
              return;
            }

            startTransition(() => {
              router.refresh();
            });
          } finally {
            setIsSubmitting(false);
          }
        }}
        type="button"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M20 11a8 8 0 1 0 2.3 5.7M20 4v7h-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
        {busy ? 'Refreshing…' : label}
      </Button>
      {busy ? <p className="text-xs text-[var(--text-muted)]">Generating a new recommendation batch…</p> : null}
      {error ? <p className="text-xs text-[#ff9aa3]">{error}</p> : null}
    </div>
  );
}
