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
        {busy ? 'Refreshing…' : label}
      </Button>
      {busy ? <p className="text-xs text-[var(--text-muted)]">Generating a new recommendation batch…</p> : null}
      {error ? <p className="text-xs text-[#ff9aa3]">{error}</p> : null}
    </div>
  );
}
