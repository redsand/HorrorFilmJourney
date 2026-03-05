import type { JourneyWorthinessConfig } from '@/lib/journey/journeyWorthiness';

export const SEASON_3_JOURNEY_WORTHINESS_CONFIG: JourneyWorthinessConfig = {
  gates: {
    journeyMinCore: 0.57,
    journeyMinExtended: 0.52,
  },
  thresholds: {
    minVoteCount: 1200,
    minPopularity: 10,
    minMetadataCompleteness: 0.7,
    minRuntimeMinutes: 50,
    maxRuntimeMinutes: 240,
    minYear: 1900,
    maxFutureYears: 1,
  },
  weights: {
    ratingsQuality: 0.3,
    voteCount: 0.2,
    popularity: 0.15,
    metadataCompleteness: 0.2,
    receptionPresence: 0.1,
    runtimeYearSanity: 0.05,
  },
};
