import type { JourneyWorthinessConfig } from '@/lib/journey/journeyWorthiness';

export const DEFAULT_JOURNEY_WORTHINESS_CONFIG: JourneyWorthinessConfig = {
  gates: {
    journeyMinCore: 0.6,
    journeyMinExtended: 0.6,
  },
  thresholds: {
    minVoteCount: 2500,
    minPopularity: 25,
    minMetadataCompleteness: 0.7,
    minRuntimeMinutes: 60,
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
