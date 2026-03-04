export type Season1EssentialFixtureEntry = {
  title: string;
  year: number;
  altTitle?: string;
  tmdbId?: number;
};

export type Season1EssentialMissing = {
  title: string;
  year: number;
  altTitle?: string;
  tmdbId?: number;
  reason: string;
  recommendedFix: string;
  details: string[];
};

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toEssentialLookupKeys(entry: Season1EssentialFixtureEntry): string[] {
  const keys = [`${normalizeTitle(entry.title)}::${entry.year}`];
  if (entry.altTitle && entry.altTitle.trim().length > 0) {
    keys.push(`${normalizeTitle(entry.altTitle)}::${entry.year}`);
  }
  return [...new Set(keys)];
}

export function recommendedFixForReason(reason: string): string {
  if (reason === 'movie_not_in_catalog') return 'catalog_sync_or_manual_import';
  if (reason === 'missing_credits') return 'credits_backfill';
  if (reason === 'missing_ratings') return 'votes_backfill';
  if (reason === 'missing_poster') return 'poster_sync_or_reingest';
  if (reason === 'missing_reception') return 'ensure_local_rating_sources_present';
  if (reason === 'node_score_below_quality_floor') return 'add_or_refine_prototypes_and_targeted_lfs';
  if (reason.startsWith('journey_gate_fail:missing_metadata')) return 'metadata_backfill_then_rebuild';
  if (reason.startsWith('journey_gate_fail:')) return 'journey_model_tuning_or_manual_anchor';
  if (reason === 'overlap_or_capacity_exclusion') return 'review_overlap_constraints_and_core_extended_selection';
  return 'manual_review';
}

export function formatSeason1EssentialsGateFailure(missing: Season1EssentialMissing[], sampleSize = 10): string {
  if (missing.length === 0) {
    return 'all essentials present';
  }
  const sample = missing
    .slice(0, sampleSize)
    .map((item) => `${item.title} (${item.year}) -> ${item.reason} -> ${item.recommendedFix}`)
    .join(' | ');
  return `missing=${missing.length}; ${sample}`;
}

