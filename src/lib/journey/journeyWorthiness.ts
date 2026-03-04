import { loadSeasonJourneyWorthinessConfig } from '@/config/seasons/journey-worthiness';
import { normalizeMovieSignals } from '@/lib/movie/normalized-signals';
import { computeReceptionCount } from '@/lib/movie/reception';

export type JourneyWorthinessRating = {
  source: string;
  value: number;
  scale?: string;
};

export type JourneyWorthinessMovieInput = {
  year?: number | null;
  runtimeMinutes?: number | null;
  popularity?: number | null;
  voteCount?: number | null;
  posterUrl?: string | null;
  synopsis?: string | null;
  director?: string | null;
  castTop?: unknown;
  genres?: string[] | null;
  keywords?: string[] | null;
  ratings?: JourneyWorthinessRating[] | null;
  receptionSources?: string[] | null;
};

export type JourneyWorthinessReason =
  | 'low_vote_count'
  | 'missing_metadata'
  | 'runtime_outlier'
  | 'low_rating';

export type JourneyWorthinessConfig = {
  gates?: {
    journeyMinCore?: number;
    journeyMinExtended?: number;
  };
  thresholds: {
    minVoteCount: number;
    minPopularity: number;
    minMetadataCompleteness: number;
    minRuntimeMinutes: number;
    maxRuntimeMinutes: number;
    minYear: number;
    maxFutureYears: number;
  };
  weights: {
    ratingsQuality: number;
    voteCount: number;
    popularity: number;
    metadataCompleteness: number;
    receptionPresence: number;
    runtimeYearSanity: number;
  };
};

export type JourneyWorthinessResult = {
  score: number;
  reasons: JourneyWorthinessReason[];
  evidence: {
    normalizedRating: number;
    voteConfidence: number;
    popularity: number;
    metadataCompleteness: number;
    directorSignal: number;
    weighted: {
      normalizedRating: number;
      voteConfidence: number;
      popularity: number;
      metadataCompleteness: number;
      directorSignal: number;
    };
  };
  breakdown: {
    ratingsQuality: number;
    voteCount: number;
    popularity: number;
    metadataCompleteness: number;
    receptionPresence: number;
    runtimeYearSanity: number;
  };
};

type ComputeJourneyWorthinessOptions = {
  nowYear?: number;
};

export type JourneyWorthinessGateOptions = ComputeJourneyWorthinessOptions & {
  threshold?: number;
};

export const DEFAULT_JOURNEY_WORTHINESS_GATE_THRESHOLD = 0.6;

export type JourneyWorthinessGateResult = {
  pass: boolean;
  threshold: number;
  result: JourneyWorthinessResult;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeRatingTo100(rating: JourneyWorthinessRating): number | null {
  if (!Number.isFinite(rating.value)) {
    return null;
  }
  const scale = (rating.scale ?? '').trim();
  if (scale === '10') {
    return clamp01(rating.value / 10) * 100;
  }
  if (scale === '5') {
    return clamp01(rating.value / 5) * 100;
  }
  if (scale === '100' || scale.length === 0) {
    return clamp01(rating.value / 100) * 100;
  }
  const parsedScale = Number.parseFloat(scale);
  if (Number.isFinite(parsedScale) && parsedScale > 0) {
    return clamp01(rating.value / parsedScale) * 100;
  }
  return null;
}

function hasCredits(input: JourneyWorthinessMovieInput): boolean {
  const hasDirector = typeof input.director === 'string' && input.director.trim().length > 0;
  const cast = Array.isArray(input.castTop) ? input.castTop : [];
  const hasCast = cast.some((entry) => {
    if (typeof entry === 'string') {
      return entry.trim().length > 0;
    }
    return Boolean(
      entry
      && typeof entry === 'object'
      && typeof (entry as { name?: unknown }).name === 'string'
      && (entry as { name: string }).name.trim().length > 0,
    );
  });
  return hasDirector && hasCast;
}

function computeMetadataCompleteness(input: JourneyWorthinessMovieInput): number {
  const checks = [
    typeof input.posterUrl === 'string' && input.posterUrl.trim().length > 0,
    typeof input.synopsis === 'string' && input.synopsis.trim().length > 0,
    hasCredits(input),
    Array.isArray(input.genres) && input.genres.length > 0,
    Array.isArray(input.keywords) && input.keywords.length > 0,
  ];
  const passCount = checks.filter(Boolean).length;
  return passCount / checks.length;
}

function computeRatingsQuality(ratings: JourneyWorthinessRating[] | null | undefined): number {
  if (!ratings || ratings.length === 0) {
    return 0;
  }
  const normalized = ratings
    .map((rating) => normalizeRatingTo100(rating))
    .filter((entry): entry is number => typeof entry === 'number');
  if (normalized.length === 0) {
    return 0;
  }
  const avg = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
  return clamp01(avg / 100);
}

function toRatingOutOf10(ratings: JourneyWorthinessRating[] | null | undefined): number | null {
  if (!ratings || ratings.length === 0) {
    return null;
  }
  const normalized = ratings
    .map((rating) => normalizeRatingTo100(rating))
    .filter((entry): entry is number => typeof entry === 'number');
  if (normalized.length === 0) {
    return null;
  }
  const avg100 = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
  return clamp01(avg100 / 100) * 10;
}

function computePopularityScore(popularity: number | null | undefined): number {
  if (!Number.isFinite(popularity)) {
    return 0;
  }
  return clamp01((popularity as number) / 100);
}

function computeReceptionPresence(input: JourneyWorthinessMovieInput): number {
  if (Array.isArray(input.receptionSources) && input.receptionSources.length > 0) {
    return 1;
  }
  const receptionCount = computeReceptionCount((input.ratings ?? []).map((rating) => ({
    source: rating.source,
    value: rating.value,
  })));
  return receptionCount > 0 ? 1 : 0;
}

function computeRuntimeYearSanity(
  input: JourneyWorthinessMovieInput,
  config: JourneyWorthinessConfig,
  nowYear: number,
): number {
  const runtimeOk = Number.isFinite(input.runtimeMinutes)
    && (input.runtimeMinutes as number) >= config.thresholds.minRuntimeMinutes
    && (input.runtimeMinutes as number) <= config.thresholds.maxRuntimeMinutes;
  const maxYear = nowYear + config.thresholds.maxFutureYears;
  const yearOk = Number.isFinite(input.year)
    && (input.year as number) >= config.thresholds.minYear
    && (input.year as number) <= maxYear;
  if (runtimeOk && yearOk) {
    return 1;
  }
  if (runtimeOk || yearOk) {
    return 0.5;
  }
  return 0;
}

export function computeJourneyWorthiness(
  movie: JourneyWorthinessMovieInput,
  seasonId: string,
  options?: ComputeJourneyWorthinessOptions,
): JourneyWorthinessResult {
  const config = loadSeasonJourneyWorthinessConfig(seasonId);
  const nowYear = options?.nowYear ?? new Date().getUTCFullYear();

  const normalizedSignals = normalizeMovieSignals({
    voteCount: movie.voteCount,
    rating: toRatingOutOf10(movie.ratings),
    popularity: movie.popularity,
    runtimeMinutes: movie.runtimeMinutes,
    ratings: (movie.ratings ?? []).map((rating) => ({
      source: rating.source,
      value: rating.value,
    })),
    metadataCompleteness: computeMetadataCompleteness(movie),
  });
  const normalizedRating = normalizedSignals.rating;
  const voteConfidence = clamp01(normalizedSignals.voteCount / 5);
  const popularity = normalizedSignals.popularity;
  const metadataCompleteness = computeMetadataCompleteness(movie);
  const receptionPresence = computeReceptionPresence(movie);
  const runtimeYearSanity = computeRuntimeYearSanity(movie, config, nowYear);
  const directorSignal = typeof movie.director === 'string' && movie.director.trim().length > 0 ? 1 : 0;

  const weighted = {
    normalizedRating: normalizedRating * 0.35,
    voteConfidence: voteConfidence * 0.25,
    popularity: popularity * 0.15,
    metadataCompleteness: metadataCompleteness * 0.15,
    directorSignal: directorSignal * 0.10,
  };
  const score = Number(clamp01(
    weighted.normalizedRating
    + weighted.voteConfidence
    + weighted.popularity
    + weighted.metadataCompleteness
    + weighted.directorSignal,
  ).toFixed(6));

  const reasons: JourneyWorthinessReason[] = [];
  if (!Number.isFinite(movie.voteCount) || (movie.voteCount as number) < config.thresholds.minVoteCount || voteConfidence < 0.45) {
    reasons.push('low_vote_count');
  }
  if (metadataCompleteness < config.thresholds.minMetadataCompleteness) {
    reasons.push('missing_metadata');
  }
  if (
    !Number.isFinite(movie.runtimeMinutes)
    || (movie.runtimeMinutes as number) < config.thresholds.minRuntimeMinutes
    || (movie.runtimeMinutes as number) > config.thresholds.maxRuntimeMinutes
  ) {
    reasons.push('runtime_outlier');
  }
  if (normalizedRating < 0.6) {
    reasons.push('low_rating');
  }

  return {
    score,
    reasons,
    evidence: {
      normalizedRating: Number(normalizedRating.toFixed(6)),
      voteConfidence: Number(voteConfidence.toFixed(6)),
      popularity: Number(popularity.toFixed(6)),
      metadataCompleteness: Number(metadataCompleteness.toFixed(6)),
      directorSignal: Number(directorSignal.toFixed(6)),
      weighted: {
        normalizedRating: Number(weighted.normalizedRating.toFixed(6)),
        voteConfidence: Number(weighted.voteConfidence.toFixed(6)),
        popularity: Number(weighted.popularity.toFixed(6)),
        metadataCompleteness: Number(weighted.metadataCompleteness.toFixed(6)),
        directorSignal: Number(weighted.directorSignal.toFixed(6)),
      },
    },
    breakdown: {
      ratingsQuality: Number(normalizedRating.toFixed(6)),
      voteCount: Number(voteConfidence.toFixed(6)),
      popularity: Number(popularity.toFixed(6)),
      metadataCompleteness: Number(metadataCompleteness.toFixed(6)),
      receptionPresence: Number(receptionPresence.toFixed(6)),
      runtimeYearSanity: Number(runtimeYearSanity.toFixed(6)),
    },
  };
}

export function evaluateJourneyWorthinessSelectionGate(
  movie: JourneyWorthinessMovieInput,
  seasonId: string,
  options?: JourneyWorthinessGateOptions,
): JourneyWorthinessGateResult {
  const result = computeJourneyWorthiness(movie, seasonId, options);
  const threshold = options?.threshold ?? DEFAULT_JOURNEY_WORTHINESS_GATE_THRESHOLD;
  return {
    pass: result.score >= threshold,
    threshold,
    result,
  };
}

export function journeyWorthinessSelectionGatePass(
  movie: JourneyWorthinessMovieInput,
  seasonId: string,
  options?: JourneyWorthinessGateOptions,
): boolean {
  return evaluateJourneyWorthinessSelectionGate(movie, seasonId, options).pass;
}

export function journeyWorthinessDiagnosticPass(
  movie: JourneyWorthinessMovieInput,
  seasonId: string,
  options?: JourneyWorthinessGateOptions,
): boolean {
  return journeyWorthinessSelectionGatePass(movie, seasonId, options);
}
