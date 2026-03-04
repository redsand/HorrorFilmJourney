import type { JourneyWorthinessConfig } from '@/lib/journey/journeyWorthiness';

export const SEASON_2_JOURNEY_WORTHINESS_CONFIG: JourneyWorthinessConfig = {
  gates: {
    journeyMinCore: 0.55,
    journeyMinExtended: 0.5,
  },
  thresholds: {
    minVoteCount: 1500,
    minPopularity: 12,
    minMetadataCompleteness: 0.7,
    minRuntimeMinutes: 60,
    maxRuntimeMinutes: 240,
    minYear: 1900,
    maxFutureYears: 1,
  },
  weights: {
    ratingsQuality: 0.28,
    voteCount: 0.2,
    popularity: 0.16,
    metadataCompleteness: 0.2,
    receptionPresence: 0.11,
    runtimeYearSanity: 0.05,
  },
};

