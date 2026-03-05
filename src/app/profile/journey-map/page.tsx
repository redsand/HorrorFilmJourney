'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { JourneyTimelineView } from '@/components/journey/JourneyTimelineView';
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

export default function ProfileJourneyMapPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progression, setProgression] = useState<ProgressionData | null>(null);
  const [selectedPackSlug, setSelectedPackSlug] = useState<string>('horror');
  const [journeyMap, setJourneyMap] = useState<JourneyMapResponse | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [progressionResponse, preferenceResponse, mapResponse] = await Promise.all([
          fetch('/api/profile/progression', { method: 'GET', credentials: 'include' }),
          fetch('/api/profile/preferences', { method: 'GET', credentials: 'include' }),
          fetch('/api/journey/map', { method: 'GET', credentials: 'include' }),
        ]);

        if (!progressionResponse.ok) {
          setError(progressionResponse.status === 401 ? 'Please log in.' : 'Unable to load journey map.');
          return;
        }

        const progressionPayload = await progressionResponse.json();
        setProgression(progressionPayload.data as ProgressionData);

        if (preferenceResponse.ok) {
          const preferencePayload = await preferenceResponse.json();
          const preferenceData = (preferencePayload?.data ?? {}) as PreferenceData;
          if (typeof preferenceData.selectedPackSlug === 'string' && preferenceData.selectedPackSlug.trim().length > 0) {
            setSelectedPackSlug(preferenceData.selectedPackSlug);
          }
        }

        if (mapResponse.ok) {
          const mapPayload = await mapResponse.json();
          setJourneyMap((mapPayload?.data ?? null) as JourneyMapResponse | null);
        }
      } catch {
        setError('Unable to load journey map.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const packCopy = getPackCopy(selectedPackSlug);
  const completionRatio = progression
    ? Math.max(0, Math.min(1, progression.completedCount / Math.max(1, progression.nextMilestone)))
    : 0;

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-16">
      {loading ? (
        <Card><p className="text-sm text-[var(--text-muted)]">Loading journey timeline...</p></Card>
      ) : error ? (
        <Card className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">{error}</p>
          <Link href="/profile"><Button variant="secondary">Back to Profile</Button></Link>
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Journey Atlas</p>
            <p className="text-sm leading-6 text-[var(--text)]">
              Track your progression through {packCopy.masteryDisciplineLabel}. Each movement opens the next chapter.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Current node: {progression?.currentNode ?? 'Unknown'} | Mastery score: {progression?.masteryScore?.toFixed(2) ?? '0.00'} | Completed: {progression?.completedCount ?? 0}/{progression?.nextMilestone ?? 0}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.1)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,rgba(127,29,29,0.95),rgba(220,38,38,0.95))] transition-all duration-700 ease-out"
                style={{ width: `${Math.max(6, Math.round(completionRatio * 100))}%` }}
              />
            </div>
          </Card>
          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Unlocked Themes</p>
            <div className="flex flex-wrap gap-2">
              {progression?.unlockedThemes?.length
                ? progression.unlockedThemes.map((theme) => <Chip key={theme}>{theme}</Chip>)
                : <Chip>No themes unlocked yet</Chip>}
            </div>
          </Card>
          <JourneyTimelineView
            baseHref="/journey"
            currentNodeSlug={progression?.currentNode ?? null}
            data={journeyMap}
          />
        </>
      )}

      <Card className="mt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Journey Map</p>
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
