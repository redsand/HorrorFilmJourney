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
type Insight = {
  id: string;
  type: 'decade' | 'subgenre' | 'intensity' | 'comparison';
  message: string;
  delta: number;
  sampleSize: number;
};
type DnaHistory = {
  snapshots: Array<{ takenAt: string }>;
  evolutionNarrative: string;
};
type ProgressionData = {
  currentNode: string;
  masteryScore: number;
  completedCount: number;
  nextMilestone: number;
  unlockedThemes: string[];
};
type PacksResponse = {
  activeSeason: { slug: string; name: string };
  packs: Array<{ slug: string; name: string; isEnabled: boolean; seasonSlug: string }>;
};

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [recommendationStyle, setRecommendationStyle] = useState<RecommendationStyle>('diversity');
  const [tolerance, setTolerance] = useState<number>(3);
  const [pacePreference, setPacePreference] = useState<PacePreference>('balanced');
  const [savingPreference, setSavingPreference] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dnaHistory, setDnaHistory] = useState<DnaHistory | null>(null);
  const [progression, setProgression] = useState<ProgressionData | null>(null);
  const [packs, setPacks] = useState<PacksResponse | null>(null);
  const [selectedPackSlug, setSelectedPackSlug] = useState<string>('horror');

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
        const nextPackSlug = preferencePayload?.data?.selectedPackSlug;
        if (typeof nextPackSlug === 'string' && nextPackSlug.trim().length > 0) {
          setSelectedPackSlug(nextPackSlug);
        }
      }
      const insightResponse = await fetch('/api/profile/insights', {
        method: 'GET',
        credentials: 'include',
      });
      if (insightResponse.ok) {
        const insightPayload = await insightResponse.json();
        setInsights(Array.isArray(insightPayload?.data?.insights) ? insightPayload.data.insights as Insight[] : []);
      }
      const [historyResponse, progressionResponse] = await Promise.all([
        fetch('/api/profile/dna/history', { method: 'GET', credentials: 'include' }),
        fetch('/api/profile/progression', { method: 'GET', credentials: 'include' }),
      ]);
      if (historyResponse.ok) {
        const historyPayload = await historyResponse.json();
        setDnaHistory(historyPayload?.data as DnaHistory);
      }
      if (progressionResponse.ok) {
        const progressionPayload = await progressionResponse.json();
        setProgression(progressionPayload?.data as ProgressionData);
      }
      const packsResponse = await fetch('/api/packs', {
        method: 'GET',
        credentials: 'include',
      });
      if (packsResponse.ok) {
        const packsPayload = await packsResponse.json();
        setPacks((packsPayload?.data ?? null) as PacksResponse | null);
      }
      setLoading(false);
    })();
  }, []);

  const foundationalTarget = 10;
  const masteryRatio = progression
    ? Math.max(0, Math.min(1, progression.completedCount / foundationalTarget))
    : 0;

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-16">

      {loading ? (
        <Card><p className="text-sm text-[var(--text-muted)]">Loading profile...</p></Card>
      ) : !me ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">You are not logged in.</p>
          <Link className="mt-4 inline-flex" href="/login"><Button>Login</Button></Link>
        </Card>
      ) : (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{me.displayName}</h2>
          <p className="text-sm leading-6 text-[var(--text-muted)]">{me.email}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Role</span>
            <Chip tone={me.role === 'ADMIN' ? 'accent' : 'default'}>{me.role}</Chip>
          </div>
          <div className="space-y-2">
            {packs?.packs?.length ? (
              <>
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Pack ({packs.activeSeason.name})</p>
                <div className="grid grid-cols-1 gap-2">
                  {packs.packs.filter((pack) => pack.isEnabled).map((pack) => (
                    <button
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        selectedPackSlug === pack.slug
                          ? 'border-[rgba(193,18,31,0.7)] bg-[rgba(155,17,30,0.22)] text-[var(--text)]'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                      }`}
                      key={pack.slug}
                      onClick={async () => {
                        if (pack.slug === selectedPackSlug || savingPreference) {
                          return;
                        }
                        setSavingPreference(true);
                        try {
                          const response = await fetch('/api/profile/preferences', {
                            method: 'PATCH',
                            credentials: 'include',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ selectedPackSlug: pack.slug }),
                          });
                          if (response.ok) {
                            setSelectedPackSlug(pack.slug);
                          }
                        } finally {
                          setSavingPreference(false);
                        }
                      }}
                      type="button"
                    >
                      {pack.name}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <p className="pt-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">Recommendation style</p>
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
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Diversity broadens eras/subgenres. Popularity prioritizes widely favored titles.
            </p>
          </div>
          <div className="space-y-2 border-t border-[var(--border)] pt-4">
            <p className="pt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">Insights</p>
            {insights.length > 0 ? (
              <ul className="space-y-2 text-sm text-[var(--text)]">
                {insights.map((insight) => (
                  <li className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 leading-6" key={insight.id}>
                    {insight.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Keep rating films to unlock thematic insights.</p>
            )}
          </div>
          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Onboarding preferences</p>
            <div>
              <p className="mb-2 pt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">Intensity</p>
              <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
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
              <p className="mb-2 pt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">Pace</p>
              <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
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
            <div className="pt-1">
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
                        selectedPackSlug,
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
          <div className="border-t border-[var(--border)] pt-3">
            <Link className="mb-2 inline-flex w-full" href="/profile/progression">
              <Button className="w-full" variant="secondary">
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <path d="M4 18V9m5 9V6m5 12v-7m5 7V4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
                View Journey Progression
              </Button>
            </Link>
            <Link className="inline-flex w-full" href="/profile/dna">
              <Button className="w-full" variant="secondary">
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <path d="M4 18V8m4 10V6m4 12V10m4 8V4m4 14V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
                View Cinematic DNA
              </Button>
            </Link>
          </div>
          {me.role === 'ADMIN' ? (
            <div className="grid grid-cols-2 gap-2">
              <Link className="inline-flex" href="/admin/users"><Button className="w-full" variant="secondary">Manage Users</Button></Link>
              <Link className="inline-flex" href="/admin/feedback"><Button className="w-full" variant="secondary">Manage Feedback</Button></Link>
              <Link className="inline-flex" href="/admin/packs"><Button className="w-full" variant="secondary">Manage Packs</Button></Link>
              <Link className="inline-flex" href="/admin/curriculum"><Button className="w-full" variant="secondary">Manage Curriculum</Button></Link>
              <Link className="inline-flex" href="/admin/system"><Button className="w-full" variant="secondary">System</Button></Link>
            </div>
          ) : null}
        </Card>
      )}

      {!loading && me ? (
        <>
          <Card className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Your Evolution</p>
            <p className="text-sm leading-6 text-[var(--text)]">
              {dnaHistory?.evolutionNarrative ?? 'Keep rating films to unlock your evolution narrative.'}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {dnaHistory?.snapshots?.length
                ? `${dnaHistory.snapshots.length} DNA snapshots captured so far.`
                : 'No snapshots yet.'}
            </p>
          </Card>

          <Card className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Mastery Progress</p>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.1)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,rgba(127,29,29,0.95),rgba(220,38,38,0.95))] transition-all duration-700 ease-out"
                style={{ width: `${Math.max(6, Math.round(masteryRatio * 100))}%` }}
              />
            </div>
            <p className="text-sm leading-6 text-[var(--text)]">
              You&apos;ve completed {progression?.completedCount ?? 0}/{foundationalTarget} foundational psychological horror films.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Mastery score: {progression?.masteryScore?.toFixed(2) ?? '0.00'}
            </p>
          </Card>

          <Card className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Next Stage</p>
            <p className="text-sm leading-6 text-[var(--text)]">
              {progression
                ? `Your current node is ${progression.currentNode}. Reaching ${progression.nextMilestone} completed films deepens your command of horror language and unlocks harder thematic comparisons.`
                : 'Your next stage unlocks once you complete and rate more films.'}
            </p>
          </Card>
        </>
      ) : null}

      {!loading && me ? (
        <Card className="mt-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Profile</p>
            <LogoutIconButton />
          </div>
        </Card>
      ) : null}

      <BottomNav
        activeId="profile"
        items={[
          { id: 'journey', label: 'Journey', href: '/journey' },
          { id: 'history', label: 'History', href: '/history' },
          { id: 'profile', label: 'Profile', href: '/profile' },
          { id: 'search', label: 'Search', href: '/search' },
        ]}
      />
    </main>
  );
}
