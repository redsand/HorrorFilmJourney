'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CinematicDnaViz, type CinematicDnaTraits } from '@/components/profile/CinematicDnaViz';
import { BottomNav, Button, Card, Chip, LogoutIconButton } from '@/components/ui';

type DnaResponse = {
  traits: CinematicDnaTraits;
  summaryNarrative: string;
  evolution?: unknown;
  lastComputedAt?: string;
};

type DnaHistoryResponse = {
  snapshots: Array<{
    takenAt: string;
    intensityPreference: number;
    pacingPreference: number;
    psychologicalVsSupernatural: number;
    goreTolerance: number;
    ambiguityTolerance: number;
    nostalgiaBias: number;
    auteurAffinity: number;
  }>;
  evolutionNarrative: string;
};

function hasHigh(traits: CinematicDnaTraits, key: keyof CinematicDnaTraits, threshold: number): boolean {
  const value = traits[key];
  return Number.isFinite(value) && value >= threshold;
}

export default function ProfileDnaPage() {
  const [data, setData] = useState<DnaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DnaHistoryResponse | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/profile/dna', {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          setError(response.status === 401 ? 'Please log in to view your DNA profile.' : 'Unable to load cinematic DNA.');
          return;
        }
        const payload = await response.json();
        setData(payload?.data as DnaResponse);
        const historyResponse = await fetch('/api/profile/dna/history', {
          method: 'GET',
          credentials: 'include',
        });
        if (historyResponse.ok) {
          const historyPayload = await historyResponse.json();
          setHistory(historyPayload?.data as DnaHistoryResponse);
        }
      } catch {
        setError('Unable to load cinematic DNA.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const labelState = useMemo(() => {
    if (!data) {
      return { intensity: false, auteur: false, ambiguity: false };
    }
    return {
      intensity: hasHigh(data.traits, 'intensityPreference', 0.66),
      auteur: hasHigh(data.traits, 'auteurAffinity', 0.6),
      ambiguity: hasHigh(data.traits, 'ambiguityTolerance', 0.6),
    };
  }, [data]);

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Horror Codex</h1>
            <p className="text-xs text-[var(--text-muted)]">Cinematic DNA</p>
          </div>
          <LogoutIconButton />
        </div>
      </header>

      {loading ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">Computing your taste profile...</p>
        </Card>
      ) : error ? (
        <Card className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">{error}</p>
          <Link href="/profile"><Button variant="secondary">Back to Profile</Button></Link>
        </Card>
      ) : data ? (
        <>
          <Card className="space-y-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Taste Signature</p>
            <CinematicDnaViz traits={data.traits} />
            <div className="flex flex-wrap gap-2">
              <Chip tone={labelState.intensity ? 'accent' : 'default'}>High Intensity</Chip>
              <Chip tone={labelState.auteur ? 'accent' : 'default'}>Auteur-Driven</Chip>
              <Chip tone={labelState.ambiguity ? 'accent' : 'default'}>Ambiguity Seeker</Chip>
            </div>
          </Card>

          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Summary</p>
            <p className="text-sm leading-6 text-[var(--text)]">{data.summaryNarrative}</p>
            <p className="text-xs text-[var(--text-muted)]">
              Last updated {data.lastComputedAt ? new Date(data.lastComputedAt).toLocaleString() : 'just now'}
            </p>
          </Card>

          <Card className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Taste Evolution</p>
            <p className="text-sm leading-6 text-[var(--text)]">
              {history?.evolutionNarrative ?? 'No evolution data yet.'}
            </p>
            {history?.snapshots?.length ? (
              <ol className="space-y-2">
                {history.snapshots.slice().reverse().map((snapshot) => (
                  <li className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" key={snapshot.takenAt}>
                    <p className="text-xs text-[var(--text-muted)]">{new Date(snapshot.takenAt).toLocaleDateString()}</p>
                    <p className="text-sm text-[var(--text)]">
                      Intensity {Math.round(snapshot.intensityPreference * 100)}% · Pace {Math.round(snapshot.pacingPreference * 100)}% · Psych {Math.round(snapshot.psychologicalVsSupernatural * 100)}%
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Keep rating films to unlock a timeline.</p>
            )}
          </Card>
        </>
      ) : null}

      <BottomNav
        activeId="profile"
        items={[
          { id: 'journey', label: 'Journey', href: '/journey' },
          { id: 'history', label: 'History', href: '/history' },
          { id: 'profile', label: 'Profile', href: '/profile' },
        ]}
      />
    </main>
  );
}
