'use client';

import { useState } from 'react';
import { Button, Card, Chip } from '@/components/ui';
import { getSeasonQuickPollOptions } from '@/lib/journey/season-quick-poll-options';

type QuickPollSubmit = {
  rating: number;
  intensity?: number;
  emotions?: string[];
  workedBest?: string[];
  agedWell?: string;
  recommend?: boolean;
};

type QuickPollProps = {
  open: boolean;
  status: 'WATCHED' | 'ALREADY_SEEN';
  title: string;
  seasonSlug?: string | null;
  onClose: () => void;
  onSubmit: (payload: QuickPollSubmit) => Promise<void>;
};

function toggleWithCap(current: string[], value: string, cap: number): string[] {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  if (current.length >= cap) {
    return current;
  }
  return [...current, value];
}

export function QuickPoll({
  open,
  status,
  title,
  seasonSlug,
  onClose,
  onSubmit,
}: QuickPollProps) {
  const [rating, setRating] = useState<number>(0);
  const [intensity, setIntensity] = useState<number>(3);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [workedBest, setWorkedBest] = useState<string[]>([]);
  const [agedWell, setAgedWell] = useState<string>('mostly');
  const [recommend, setRecommend] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const options = getSeasonQuickPollOptions(seasonSlug);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] bg-[rgba(0,0,0,0.72)]">
      <button
        aria-label="Close quick poll"
        className="absolute inset-0 h-full w-full"
        onClick={onClose}
        type="button"
      />
      <Card className="absolute inset-x-2 bottom-2 max-h-[88vh] overflow-y-auto rounded-2xl border-[rgba(193,18,31,0.45)] p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Quick Poll</p>
        <h3 className="mt-1 text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {status === 'WATCHED' ? 'You watched it. Capture the reaction quickly.' : 'You already saw it. Rate to tune the next picks.'}
        </p>

        <div className={`mt-4 rounded-xl border p-3 ${rating < 1 ? (attemptedSubmit ? 'border-[#ff6b7a] bg-[rgba(193,18,31,0.12)]' : 'border-[rgba(193,18,31,0.35)] bg-[rgba(193,18,31,0.08)]') : 'border-[var(--border)] bg-[rgba(10,10,12,0.45)]'}`}>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Rating (required)</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                aria-label={`Rate ${value}`}
                className="text-3xl leading-none"
                key={value}
                onClick={() => setRating(value)}
                type="button"
              >
                <span className={value <= rating ? 'text-[var(--accent-strong)]' : 'text-[var(--text-muted)]'}>★</span>
              </button>
            ))}
          </div>
          {rating < 1 ? (
            <p className={`mt-2 text-xs ${attemptedSubmit ? 'text-[#ffb4bd]' : 'text-[var(--text-muted)]'}`}>
              {attemptedSubmit ? 'Please select a star rating before submitting.' : 'Waiting for input.'}
            </p>
          ) : null}
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${intensity ? 'border-[var(--border)] bg-[rgba(10,10,12,0.45)]' : 'border-[rgba(193,18,31,0.35)] bg-[rgba(193,18,31,0.08)]'}`}>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Intensity</p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                className={`rounded-lg border px-0 py-2 text-sm ${intensity === value ? 'border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]'}`}
                key={value}
                onClick={() => setIntensity(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${emotions.length > 0 ? 'border-[var(--border)] bg-[rgba(10,10,12,0.45)]' : 'border-[rgba(193,18,31,0.35)] bg-[rgba(193,18,31,0.08)]'}`}>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Emotions (max 5)</p>
          <div className="flex flex-wrap gap-2">
            {options.emotions.map((item) => {
              const active = emotions.includes(item);
              const blocked = !active && emotions.length >= 5;
              return (
                <button
                  disabled={blocked}
                  key={item}
                  onClick={() => setEmotions((current) => toggleWithCap(current, item, 5))}
                  type="button"
                >
                  <Chip tone={active ? 'accent' : 'default'}>{item}</Chip>
                </button>
              );
            })}
          </div>
          {emotions.length === 0 ? <p className="mt-2 text-xs text-[var(--text-muted)]">Waiting for input.</p> : null}
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${workedBest.length > 0 ? 'border-[var(--border)] bg-[rgba(10,10,12,0.45)]' : 'border-[rgba(193,18,31,0.35)] bg-[rgba(193,18,31,0.08)]'}`}>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Worked best (max 3)</p>
          <div className="flex flex-wrap gap-2">
            {options.workedBest.map((item) => {
              const active = workedBest.includes(item);
              const blocked = !active && workedBest.length >= 3;
              return (
                <button
                  disabled={blocked}
                  key={item}
                  onClick={() => setWorkedBest((current) => toggleWithCap(current, item, 3))}
                  type="button"
                >
                  <Chip tone={active ? 'accent' : 'default'}>{item}</Chip>
                </button>
              );
            })}
          </div>
          {workedBest.length === 0 ? <p className="mt-2 text-xs text-[var(--text-muted)]">Waiting for input.</p> : null}
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(10,10,12,0.45)] p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Aged well</p>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
            onChange={(event) => setAgedWell(event.target.value)}
            value={agedWell}
          >
            {options.agedWell.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(10,10,12,0.45)] p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Recommend?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-lg border py-2 text-sm ${recommend ? 'border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]'}`}
              onClick={() => setRecommend(true)}
              type="button"
            >
              Yes
            </button>
            <button
              className={`rounded-lg border py-2 text-sm ${!recommend ? 'border-[rgba(193,18,31,0.72)] bg-[rgba(155,17,30,0.24)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]'}`}
              onClick={() => setRecommend(false)}
              type="button"
            >
              No
            </button>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button
            className="flex-1 py-3 text-base"
            disabled={saving || rating < 1}
            onClick={async () => {
              setAttemptedSubmit(true);
              if (rating < 1) {
                return;
              }
              setSaving(true);
              try {
                await onSubmit({
                  rating,
                  intensity,
                  emotions,
                  workedBest,
                  agedWell,
                  recommend,
                });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            type="button"
          >
            {saving ? 'Saving…' : 'Submit'}
          </Button>
          <Button className="flex-1 py-3 text-base" onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}
