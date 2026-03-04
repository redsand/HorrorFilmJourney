'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, LogoutIconButton } from '@/components/ui';

type ProgressionResponse = {
  currentNode: string;
  masteryScore: number;
  completedCount: number;
  nextMilestone: number;
  unlockedThemes: string[];
};

type JourneyMasteryCardProps = {
  initialProgression: ProgressionResponse | null;
};

export const JOURNEY_INTERACTION_SAVED_EVENT = 'journey:interaction-saved';

export function JourneyMasteryCard({ initialProgression }: JourneyMasteryCardProps) {
  const [progression, setProgression] = useState<ProgressionResponse | null>(initialProgression);

  const refreshProgression = useCallback(async () => {
    try {
      const response = await fetch('/api/profile/progression', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json() as { data?: ProgressionResponse | null };
      setProgression(payload?.data ?? null);
    } catch {
      // no-op: keep last known progression in UI
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      void refreshProgression();
    };
    window.addEventListener(JOURNEY_INTERACTION_SAVED_EVENT, handler);
    return () => {
      window.removeEventListener(JOURNEY_INTERACTION_SAVED_EVENT, handler);
    };
  }, [refreshProgression]);

  return (
    <Card className="mt-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          {progression ? (
            <div className="w-[220px]">
              <p className="mb-1 text-[11px] text-[var(--text-muted)]">
                Mastery {progression.completedCount}/{progression.nextMilestone}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.1)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(127,29,29,0.95),rgba(220,38,38,0.95))]"
                  style={{
                    width: `${Math.max(5, Math.min(100, Math.round((progression.completedCount / Math.max(1, progression.nextMilestone)) * 100)))}%`,
                  }}
                />
              </div>
            </div>
          ) : <p className="text-xs text-[var(--text-muted)]">Mastery progress will appear after your first logged watch.</p>}
        </div>
        <LogoutIconButton />
      </div>
    </Card>
  );
}
