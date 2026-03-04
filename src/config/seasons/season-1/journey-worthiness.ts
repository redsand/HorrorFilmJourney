import type { JourneyWorthinessConfig } from '@/lib/journey/journeyWorthiness';

export const SEASON_1_JOURNEY_WORTHINESS_CONFIG: JourneyWorthinessConfig = {
  gates: {
    journeyMinCore: 0.6,
    journeyMinExtended: 0.5,
  },
  thresholds: {
    minVoteCount: 3500,
    minPopularity: 20,
    minMetadataCompleteness: 0.75,
    minRuntimeMinutes: 65,
    maxRuntimeMinutes: 220,
    minYear: 1920,
    maxFutureYears: 1,
  },
  weights: {
    ratingsQuality: 0.28,
    voteCount: 0.23,
    popularity: 0.14,
    metadataCompleteness: 0.2,
    receptionPresence: 0.1,
    runtimeYearSanity: 0.05,
  },
};
