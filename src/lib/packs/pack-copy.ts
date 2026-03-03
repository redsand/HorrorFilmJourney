export type PackCopy = {
  masteryUnitLabel: string;
  masteryDisciplineLabel: string;
  nextStageDescription: string;
};

const DEFAULT_COPY: PackCopy = {
  masteryUnitLabel: 'foundational films',
  masteryDisciplineLabel: 'cinema language',
  nextStageDescription: 'deeper thematic comparisons',
};

const PACK_COPY: Record<string, PackCopy> = {
  horror: {
    masteryUnitLabel: 'foundational psychological horror films',
    masteryDisciplineLabel: 'horror language',
    nextStageDescription: 'harder thematic comparisons',
  },
  'cult-classics': {
    masteryUnitLabel: 'core cult classics',
    masteryDisciplineLabel: 'cult cinema literacy',
    nextStageDescription: 'deeper underground cinema comparisons',
  },
};

export function getPackCopy(packSlug: string | null | undefined): PackCopy {
  if (!packSlug) {
    return DEFAULT_COPY;
  }
  return PACK_COPY[packSlug] ?? DEFAULT_COPY;
}

