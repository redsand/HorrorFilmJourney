import type { SeasonWeakSupervisionPlugin } from './types';
import { season1WeakSupervisionPlugin } from './season-1';
import { season2WeakSupervisionPlugin } from './season-2';
import { season3WeakSupervisionPlugin } from './season-3';

const PLUGINS: Record<string, SeasonWeakSupervisionPlugin> = {
  [season1WeakSupervisionPlugin.seasonId]: season1WeakSupervisionPlugin,
  [season2WeakSupervisionPlugin.seasonId]: season2WeakSupervisionPlugin,
  [season3WeakSupervisionPlugin.seasonId]: season3WeakSupervisionPlugin,
};

export function getSeasonWeakSupervisionPlugin(seasonId: string): SeasonWeakSupervisionPlugin | null {
  return PLUGINS[seasonId] ?? null;
}
