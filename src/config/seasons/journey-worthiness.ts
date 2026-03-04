import type { JourneyWorthinessConfig } from '@/lib/journey/journeyWorthiness';
import { DEFAULT_JOURNEY_WORTHINESS_CONFIG } from './default-journey-worthiness';
import { SEASON_1_JOURNEY_WORTHINESS_CONFIG } from './season-1/journey-worthiness';
import { SEASON_2_JOURNEY_WORTHINESS_CONFIG } from './season-2/journey-worthiness';

const JOURNEY_WORTHINESS_CONFIG_BY_SEASON: Record<string, JourneyWorthinessConfig> = {
  'season-1': SEASON_1_JOURNEY_WORTHINESS_CONFIG,
  'season-2': SEASON_2_JOURNEY_WORTHINESS_CONFIG,
};

export function loadSeasonJourneyWorthinessConfig(seasonId: string): JourneyWorthinessConfig {
  return JOURNEY_WORTHINESS_CONFIG_BY_SEASON[seasonId] ?? DEFAULT_JOURNEY_WORTHINESS_CONFIG;
}
