'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { JourneyMap } from '@/components/journey';
import { BottomNav, Button, Card, Chip, LogoutIconButton } from '@/components/ui';
import { getPackCopy } from '@/lib/packs/pack-copy';

type ProgressionData = {
  currentNode: string;
  masteryScore: number;
  completedCount: number;
  nextMilestone: number;
  unlockedThemes: string[];
};

type PreferenceData = {
  selectedPackSlug?: string;
};

type JourneyMapResponse = {
  seasonSlug: string;
  packSlug: string;
  nodes: Array<{ slug: string; name: string; order: number; coreCount?: number; extendedCount?: number }>;
  progress?: { completedNodeSlugs: string[]; currentNodeSlug?: string };
};

export default function ProgressionPage() {
  const [data, setData] = useState<ProgressionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackSlug, setSelectedPackSlug] = useState<string>('horror');
  const [journeyMap, setJourneyMap] = useState<JourneyMapResponse | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/profile/progression', {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          setError(response.status === 401 ? 'Please log in.' : 'Unable to load progression.');
          return;
        }
        const payload = await response.json();
        setData(payload.data as ProgressionData);
        const preferenceResponse = await fetch('/api/profile/preferences', {
          method: 'GET',
          credentials: 'include',
        });
        if (preferenceResponse.ok) {
          const preferencePayload = await preferenceResponse.json();
          const preferenceData = (preferencePayload?.data ?? {}) as PreferenceData;
          if (typeof preferenceData.selectedPackSlug === 'string' && preferenceData.selectedPackSlug.trim().length > 0) {
            setSelectedPackSlug(preferenceData.selectedPackSlug);
          }
        }
        const mapResponse = await fetch('/api/journey/map', {
          method: 'GET',
          credentials: 'include',
        });
        if (mapResponse.ok) {
          const mapPayload = await mapResponse.json();
          setJourneyMap((mapPayload?.data ?? null) as JourneyMapResponse | null);
        }
      } catch {
        setError('Unable to load progression.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const completionRatio = data ? Math.max(0, Math.min(1, data.completedCount / Math.max(1, data.nextMilestone))) : 0;
  const packCopy = getPackCopy(selectedPackSlug);

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-16">

      {loading ? (
        <Card><p className="text-sm text-[var(--text-muted)]">Loading progression...</p></Card>
      ) : error ? (
        <Card className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">{error}</p>
          <Link href="/profile"><Button variant="secondary">Back to Profile</Button></Link>
        </Card>
      ) : data ? (
        <>
          <Card className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Current Node</p>
            <p className="text-sm font-medium leading-relaxed text-[var(--text)]">{data.currentNode}</p>
            <p className="text-xs text-[var(--text-muted)]">Mastery score</p>
            <p className="text-2xl font-semibold text-[var(--text)]">{data.masteryScore.toFixed(2)}</p>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.1)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,rgba(127,29,29,0.95),rgba(220,38,38,0.95))] transition-all duration-700 ease-out"
                style={{ width: `${Math.max(6, Math.round(completionRatio * 100))}%` }}
              />
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Completed {data.completedCount} {packCopy.masteryUnitLabel}. Next milestone at {data.nextMilestone}.
            </p>
          </Card>

          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Unlocked Themes</p>
            <div className="flex flex-wrap gap-2">
              {data.unlockedThemes.length > 0
                ? data.unlockedThemes.map((theme) => <Chip key={theme}>{theme}</Chip>)
                : <Chip>No themes unlocked yet</Chip>}
            </div>
          </Card>
          {journeyMap ? (
            <Card>
              <JourneyMap
                baseHref="/journey"
                currentNodeSlug={data.currentNode}
                data={journeyMap}
                packSlug={journeyMap.packSlug}
                seasonSlug={journeyMap.seasonSlug}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      <Card className="mt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Journey Progression</p>
          <LogoutIconButton />
        </div>
      </Card>

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
