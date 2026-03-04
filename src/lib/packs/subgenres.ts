export const MAX_SELECTED_SUBGENRES = 5;

export const PACK_SUBGENRE_OPTIONS: Record<string, string[]> = {
  horror: [
    // Stable top-level taxonomy.
    'supernatural',
    'psychological',
    'slasher-serial-killer',
    'creature-monster',
    'folk-horror',
    'body-horror',
    'cosmic-horror',
    'sci-fi-horror',
    'found-footage',
    'survival-horror',
    'apocalyptic-horror',
    'gothic-horror',
    'horror-comedy',
    'splatter-extreme',
    'social-domestic-horror',
    'experimental-horror',
    // Backward-compatible tags that already exist in profiles/tests/movie data.
    'slasher',
    'gothic',
    'occult',
    'creature-feature',
    'social-thriller',
    'meta-horror',
    'family-trauma',
    'zombie',
    'vampire',
    'urban-legend',
  ],
  'cult-classics': [
    'midnight-movies',
    'grindhouse',
    'exploitation',
    'arthouse-reappraisal',
    'international-shock',
    'vhs-era',
    'punk-transgressive',
    'cult-comedy',
    'dorm-room-canon',
    'goth-alternative',
  ],
};

export function getPackSubgenreOptions(packSlug: string | null | undefined): string[] {
  if (!packSlug) {
    return PACK_SUBGENRE_OPTIONS.horror;
  }
  return PACK_SUBGENRE_OPTIONS[packSlug] ?? PACK_SUBGENRE_OPTIONS.horror;
}

export function normalizeSubgenreValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}
