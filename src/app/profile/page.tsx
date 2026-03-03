'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BottomNav, Button, Card, Chip, LogoutIconButton } from '@/components/ui';

type Me = {
  id: string;
  displayName: string;
  email: string;
  role: 'ADMIN' | 'USER';
};

type RecommendationStyle = 'diversity' | 'popularity';
type PacePreference = 'slowburn' | 'balanced' | 'shock';

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [recommendationStyle, setRecommendationStyle] = useState<RecommendationStyle>('diversity');
  const [tolerance, setTolerance] = useState<number>(3);
  const [pacePreference, setPacePreference] = useState<PacePreference>('balanced');
  const [savingPreference, setSavingPreference] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        setLoading(false);
        return;
      }
      const payload = await response.json();
      setMe(payload.data as Me);
      const preferenceResponse = await fetch('/api/profile/preferences', {
        method: 'GET',
        credentials: 'include',
      });
      if (preferenceResponse.ok) {
        const preferencePayload = await preferenceResponse.json();
        const style = preferencePayload?.data?.recommendationStyle;
        setRecommendationStyle(style === 'popularity' ? 'popularity' : 'diversity');
        const nextTolerance = Number(preferencePayload?.data?.tolerance);
        const nextPace = preferencePayload?.data?.pacePreference;
        if (Number.isInteger(nextTolerance) && nextTolerance >= 1 && nextTolerance <= 5) {
          setTolerance(nextTolerance);
        }
        if (nextPace === 'slowburn' || nextPace === 'balanced' || nextPace === 'shock') {
          setPacePreference(nextPace);
        }
      }
      setLoading(false);
    })();
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Horror Codex</h1>
            <p className="text-xs text-[var(--text-muted)]">Profile</p>
          </div>
          <LogoutIconButton />
        </div>
      </header>

      {loading ? (
        <Card><p className="text-sm text-[var(--text-muted)]">Loading profile...</p></Card>
      ) : !me ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">You are not logged in.</p>
          <Link className="mt-4 inline-flex" href="/login"><Button>Login</Button></Link>
        </Card>
      ) : (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">{me.displayName}</h2>
          <p className="text-sm text-[var(--text-muted)]">{me.email}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Role</span>
            <Chip tone={me.role === 'ADMIN' ? 'accent' : 'default'}>{me.role}</Chip>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Recommendation style</p>
            <div className="grid grid-cols-2 gap-2">
              {(['diversity', 'popularity'] as const).map((style) => (
                <button
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    recommendationStyle === style
                      ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)] text-[var(--text)]'
                      : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                  }`}
                  disabled={savingPreference}
                  key={style}
                  onClick={async () => {
                    if (style === recommendationStyle) {
                      return;
                    }
                    setSavingPreference(true);
                    try {
                      const response = await fetch('/api/profile/preferences', {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ recommendationStyle: style }),
                      });
                      if (response.ok) {
                        setRecommendationStyle(style);
                      }
                    } finally {
                      setSavingPreference(false);
                    }
                  }}
                  type="button"
                >
                  {style === 'diversity' ? 'Diversity' : 'Popularity'}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Diversity broadens eras/subgenres. Popularity prioritizes widely favored titles.
            </p>
          </div>
          <div className="space-y-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Onboarding preferences</p>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Intensity</p>
              <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">
                Lower values favor atmospheric tension. Higher values allow heavier violence and shock.
              </p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    className={`rounded-lg border px-0 py-2 text-center text-sm ${
                      tolerance === value
                        ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)] text-[var(--text)]'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                    }`}
                    disabled={savingOnboarding}
                    key={value}
                    onClick={() => setTolerance(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Pace</p>
              <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">
                Slowburn builds dread, balanced mixes tension and release, shock emphasizes immediate impact.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'slowburn', label: 'Slowburn' },
                  { id: 'balanced', label: 'Balanced' },
                  { id: 'shock', label: 'Shock' },
                ] as const).map((item) => (
                  <button
                    className={`rounded-lg border px-2 py-2 text-center text-sm ${
                      pacePreference === item.id
                        ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)] text-[var(--text)]'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                    }`}
                    disabled={savingOnboarding}
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
              <Button
                className="w-full py-3 text-base"
                disabled={savingOnboarding}
                onClick={async () => {
                  setSavingOnboarding(true);
                  setOnboardingMessage(null);
                  try {
                    const response = await fetch('/api/onboarding', {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        tolerance,
                        pacePreference,
                      }),
                    });
                    if (response.ok) {
                      setOnboardingMessage('Preferences updated.');
                    } else {
                      setOnboardingMessage('Unable to save preferences.');
                    }
                  } catch {
                    setOnboardingMessage('Unable to save preferences.');
                  } finally {
                    setSavingOnboarding(false);
                  }
                }}
                type="button"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <path d="M5 4h12l2 2v14H5V4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  <path d="M8 4v6h8V4M9 16h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
                {savingOnboarding ? 'Saving...' : 'Save'}
              </Button>
            </div>
            {onboardingMessage ? (
              <p className="text-xs text-[var(--text-muted)]">{onboardingMessage}</p>
            ) : null}
          </div>
          {me.role === 'ADMIN' ? (
            <Link className="inline-flex" href="/admin/users"><Button variant="secondary">Manage Users</Button></Link>
          ) : null}
        </Card>
      )}

      <BottomNav
        activeId="profile"
        items={[
          { id: 'journey', label: 'Journey', href: '/' },
          { id: 'history', label: 'History', href: '/history' },
          { id: 'profile', label: 'Profile', href: '/profile' },
        ]}
      />
    </main>
  );
}
