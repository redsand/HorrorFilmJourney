'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { getPackCopy } from '@/lib/packs/pack-copy';
import { getPackSubgenreOptions, MAX_SELECTED_SUBGENRES, normalizeSubgenreValue } from '@/lib/packs/subgenres';

type PackEntry = { slug: string; name: string; isEnabled: boolean; seasonSlug: string };
type PacksData = {
  activeSeason: { slug: string; name: string };
  packs: PackEntry[];
} | null;

type PacePreference = 'slowburn' | 'balanced' | 'shock';
type MinimumYear = 1920 | 1930 | 1940 | 1950 | 1960 | 1970 | null;

const FIELD_LABELS: Record<string, string> = {
  tolerance: 'Intensity / tolerance',
  pacePreference: 'Pace preference',
  selectedPackSlug: 'Pack',
  selectedSubgenres: 'Subgenre picks',
  minimumYear: 'Minimum release decade',
};

function toFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function OnboardingForm({
  packs,
  initialPackSlug,
}: {
  packs: PacksData;
  initialPackSlug: string;
}) {
  const router = useRouter();
  const [tolerance, setTolerance] = useState<number>(3);
  const [pacePreference, setPacePreference] = useState<PacePreference>('balanced');
  const [selectedPackSlug, setSelectedPackSlug] = useState<string>(initialPackSlug);
  const [minimumYear, setMinimumYear] = useState<MinimumYear>(null);
  const [selectedSubgenres, setSelectedSubgenres] = useState<string[]>(() =>
    getPackSubgenreOptions(initialPackSlug).slice(0, 2),
  );
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);

  const packCopy = getPackCopy(selectedPackSlug);
  const packOptions = useMemo(
    () => (packs?.packs ?? []).filter((pack) => pack.isEnabled),
    [packs],
  );
  const availableSubgenres = useMemo(
    () => getPackSubgenreOptions(selectedPackSlug),
    [selectedPackSlug],
  );

  function toggleSubgenre(value: string): void {
    const normalized = normalizeSubgenreValue(value);
    setSelectedSubgenres((previous) => {
      if (previous.includes(normalized)) {
        return previous.filter((entry) => entry !== normalized);
      }
      if (previous.length >= MAX_SELECTED_SUBGENRES) {
        return previous;
      }
      return [...previous, normalized];
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    const nextInvalid: string[] = [];
    if (!Number.isInteger(tolerance) || tolerance < 1 || tolerance > 5) {
      nextInvalid.push('tolerance');
    }
    if (!['slowburn', 'balanced', 'shock'].includes(pacePreference)) {
      nextInvalid.push('pacePreference');
    }
    if (!selectedPackSlug) {
      nextInvalid.push('selectedPackSlug');
    }
    const allowedSubgenres = new Set(availableSubgenres.map(normalizeSubgenreValue));
    const normalizedSubgenres = [...new Set(selectedSubgenres.map(normalizeSubgenreValue))]
      .filter((value) => allowedSubgenres.has(value))
      .slice(0, MAX_SELECTED_SUBGENRES);
    if (selectedSubgenres.length > 0 && normalizedSubgenres.length === 0) {
      nextInvalid.push('selectedSubgenres');
    }
    if (nextInvalid.length > 0) {
      setInvalidFields(nextInvalid);
      setErrorMessage('Please correct the fields below and try again.');
      return;
    }

    setSaving(true);
    setInvalidFields([]);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tolerance,
          pacePreference,
          selectedPackSlug,
          selectedSubgenres: normalizedSubgenres,
          minimumYear,
          horrorDNA: {},
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error?.message ?? 'Unable to save onboarding preferences.';
        const fields: string[] = [];
        if (/subgenre/i.test(message)) fields.push('selectedSubgenres');
        if (/pack/i.test(message)) fields.push('selectedPackSlug');
        setInvalidFields(fields);
        setErrorMessage(message);
        return;
      }
      router.push('/journey');
      router.refresh();
    } catch {
      setErrorMessage('Unable to save onboarding preferences.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={onSubmit}>
      {errorMessage ? (
        <div className="rounded-lg border border-[rgba(229,73,87,0.6)] bg-[rgba(229,73,87,0.14)] p-3">
          <p className="text-sm text-[var(--text)]">{errorMessage}</p>
          {invalidFields.length > 0 ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Fields to review: {invalidFields.map(toFieldLabel).join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">{packCopy.onboardingIntensityLabel}</p>
        <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">{packCopy.onboardingIntensityHint}</p>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              className={`rounded-lg border px-0 py-2 text-center text-sm ${
                tolerance === value
                  ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)]'
                  : 'border-[var(--border)]'
              }`}
              key={value}
              onClick={() => setTolerance(value)}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {packOptions.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Pack ({packs?.activeSeason.name ?? 'Season'})</p>
          <div className="grid grid-cols-1 gap-2">
            {packOptions.map((pack) => (
              <button
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedPackSlug === pack.slug
                    ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)]'
                    : 'border-[var(--border)]'
                }`}
                key={pack.slug}
                onClick={() => {
                  setSelectedPackSlug(pack.slug);
                  const nextSubgenres = getPackSubgenreOptions(pack.slug).slice(0, 2);
                  setSelectedSubgenres(nextSubgenres);
                }}
                type="button"
              >
                {pack.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">{packCopy.onboardingPaceLabel}</p>
        <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">{packCopy.onboardingPaceHint}</p>
        <div className="grid grid-cols-3 gap-2">
          {packCopy.onboardingPaceOptions.map((item) => (
            <button
              className={`rounded-lg border px-2 py-2 text-center text-sm ${
                pacePreference === item.id
                  ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)]'
                  : 'border-[var(--border)]'
              }`}
              key={item.id}
              onClick={() => setPacePreference(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Minimum release decade</p>
        <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">Recommend films released in or after this decade.</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {([1920, 1930, 1940, 1950, 1960, 1970] as const).map((decade) => (
            <button
              className={`rounded-lg border px-2 py-2 text-center text-xs ${
                minimumYear === decade
                  ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)]'
                  : 'border-[var(--border)]'
              }`}
              key={decade}
              onClick={() => setMinimumYear(decade)}
              type="button"
            >
              {decade}s
            </button>
          ))}
          <button
            className={`rounded-lg border px-2 py-2 text-center text-xs ${
              minimumYear === null
                ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)]'
                : 'border-[var(--border)]'
            }`}
            onClick={() => setMinimumYear(null)}
            type="button"
          >
            Any
          </button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
          {packCopy.onboardingSubgenreLabel} (choose up to {MAX_SELECTED_SUBGENRES})
        </p>
        <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">{packCopy.onboardingSubgenreHint}</p>
        <div className="grid grid-cols-2 gap-2">
          {availableSubgenres.map((subgenre) => {
            const checked = selectedSubgenres.includes(subgenre);
            const disabled = !checked && selectedSubgenres.length >= MAX_SELECTED_SUBGENRES;
            return (
              <button
                className={`rounded-lg border px-2 py-2 text-center text-sm ${
                  checked
                    ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)]'
                    : 'border-[var(--border)]'
                } ${disabled ? 'opacity-60' : ''}`}
                disabled={disabled}
                key={subgenre}
                onClick={() => toggleSubgenre(subgenre)}
                type="button"
              >
                {subgenre}
              </button>
            );
          })}
        </div>
      </div>
      <Button className="w-full py-3 text-base" disabled={saving} type="submit">
        {saving ? 'Saving...' : 'Save Preferences'}
      </Button>
    </form>
  );
}
