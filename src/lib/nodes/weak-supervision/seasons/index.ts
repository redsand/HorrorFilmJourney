import type { SeasonWeakSupervisionPlugin } from './types';
import { season1WeakSupervisionPlugin } from './season-1';

const PLUGINS: Record<string, SeasonWeakSupervisionPlugin> = {
  [season1WeakSupervisionPlugin.seasonId]: season1WeakSupervisionPlugin,
};

export function getSeasonWeakSupervisionPlugin(seasonId: string): SeasonWeakSupervisionPlugin | null {
  return PLUGINS[seasonId] ?? null;
}

