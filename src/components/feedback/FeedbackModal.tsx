'use client';

import { useMemo, useState } from 'react';
import { Button, Card } from '@/components/ui';

type FeedbackType = 'BUG' | 'IDEA' | 'CONFUSION' | 'OTHER';

type FeedbackModalProps = {
  open: boolean;
  onClose: () => void;
};

const categories = [
  { value: '', label: 'General' },
  { value: 'UX', label: 'UX' },
  { value: 'Recommendation', label: 'Recommendation' },
  { value: 'Companion', label: 'Companion' },
  { value: 'Auth', label: 'Auth' },
  { value: 'Performance', label: 'Performance' },
];

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>('BUG');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => title.trim().length >= 5 && description.trim().length >= 10, [title, description]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(0,0,0,0.58)] px-3 pb-3 pt-8 sm:items-center">
      <Card className="w-full max-w-[420px] space-y-3 border-[rgba(193,18,31,0.45)] bg-[rgba(9,9,12,0.98)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Share feedback</h2>
          <button
            aria-label="Close feedback modal"
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        {message ? (
          <div className="rounded-lg border border-[rgba(193,18,31,0.35)] bg-[rgba(155,17,30,0.15)] px-3 py-2 text-sm">
            {message}
          </div>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">Type</span>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                onChange={(event) => setType(event.target.value as FeedbackType)}
                value={type}
              >
                <option value="BUG">Bug</option>
                <option value="IDEA">Idea</option>
                <option value="CONFUSION">Confusion</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">Category</span>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                {categories.map((item) => (
                  <option key={item.label} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">Title</span>
              <input
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Short summary"
                value={title}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">Description</span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm leading-5"
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What happened and what you expected"
                value={description}
              />
            </label>

            {error ? <p className="text-xs text-[#f88d95]">{error}</p> : null}

            <Button
              className="w-full py-3"
              disabled={!canSubmit || submitting}
              onClick={async () => {
                setSubmitting(true);
                setError(null);
                try {
                  const response = await fetch('/api/feedback', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                      'content-type': 'application/json',
                      'x-current-route': `${window.location.pathname}${window.location.search}`,
                    },
                    body: JSON.stringify({
                      type,
                      category: category || undefined,
                      title,
                      description,
                    }),
                  });

                  if (!response.ok) {
                    setError('Unable to submit feedback right now.');
                    return;
                  }
                  setMessage('Thanks - this helps improve the journey.');
                } catch {
                  setError('Unable to submit feedback right now.');
                } finally {
                  setSubmitting(false);
                }
              }}
              type="button"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

