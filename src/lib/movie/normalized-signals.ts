export interface NormalizedSignals {
  voteCount: number;
  rating: number;
  popularity: number;
  runtime: number;
  ratingsConfidence: number;
  metadataCompleteness: number;
  confidenceScore: number;
}

export interface NormalizedSignalsInput {
  voteCount?: number | null;
  rating?: number | null;
  popularity?: number | null;
  runtimeMinutes?: number | null;
  ratingsConfidence?: number | null;
  metadataCompleteness?: number | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function toFiniteOrNull(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

export function normalizeMovieSignals(input: NormalizedSignalsInput): NormalizedSignals {
  const voteCountRaw = toFiniteOrNull(input.voteCount);
  const ratingRaw = toFiniteOrNull(input.rating);
  const popularityRaw = toFiniteOrNull(input.popularity);
  const runtimeRaw = toFiniteOrNull(input.runtimeMinutes);

  const voteCountScore = voteCountRaw === null
    ? 0
    : Math.max(0, Math.log10(Math.max(0, voteCountRaw) + 1));
  const ratingScore = ratingRaw === null ? 0 : clamp01(ratingRaw / 10);
  const popularityScore = popularityRaw === null ? 0 : clamp01(popularityRaw / 100);
  const runtimeScore = runtimeRaw === null ? 0 : clamp01(runtimeRaw / 120);

  const providedRatingsConfidence = toFiniteOrNull(input.ratingsConfidence);
  const ratingsConfidenceScore = providedRatingsConfidence === null
    ? clamp01(((ratingScore) + clamp01(voteCountScore / 5)) / 2)
    : clamp01(providedRatingsConfidence);

  const providedMetadataCompleteness = toFiniteOrNull(input.metadataCompleteness);
  const metadataCompletenessScore = providedMetadataCompleteness === null
    ? ([
      voteCountRaw !== null,
      ratingRaw !== null,
      popularityRaw !== null,
      runtimeRaw !== null,
    ].filter(Boolean).length / 4)
    : clamp01(providedMetadataCompleteness);

  const confidenceScore = (
    (clamp01(voteCountScore / 5) * 0.3)
    + (ratingScore * 0.25)
    + (ratingsConfidenceScore * 0.25)
    + (metadataCompletenessScore * 0.2)
  );

  return {
    voteCount: round6(voteCountScore),
    rating: round6(ratingScore),
    popularity: round6(popularityScore),
    runtime: round6(runtimeScore),
    ratingsConfidence: round6(ratingsConfidenceScore),
    metadataCompleteness: round6(metadataCompletenessScore),
    confidenceScore: round6(clamp01(confidenceScore)),
  };
}
