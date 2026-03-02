'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav, Button, Card, Chip } from '@/components/ui';

type Me = {
  id: string;
  displayName: string;
  email: string;
  role: 'ADMIN' | 'USER';
};

type RecommendationStyle = 'diversity' | 'popularity';

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [recommendationStyle, setRecommendationStyle] = useState<RecommendationStyle>('diversity');
  const [savingPreference, setSavingPreference] = useState(false);
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
      }
      setLoading(false);
    })();
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <h1 className="text-xl font-semibold">Horror Codex</h1>
        <p className="text-xs text-[var(--text-muted)]">Profile</p>
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
          {me.role === 'ADMIN' ? (
            <Link className="inline-flex" href="/admin/users"><Button variant="secondary">Manage Users</Button></Link>
          ) : null}
          <Button
            onClick={async () => {
              await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
              });
              router.push('/login');
              router.refresh();
            }}
            variant="secondary"
          >
            Logout
          </Button>
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
