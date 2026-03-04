export const MAX_SELECTED_SUBGENRES = 5;

export const PACK_SUBGENRE_OPTIONS: Record<string, string[]> = {
  horror: [
    'psychological',
    'supernatural',
    'slasher',
    'gothic',
    'folk-horror',
    'body-horror',
    'found-footage',
    'occult',
    'creature-feature',
    'slowburn',
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

