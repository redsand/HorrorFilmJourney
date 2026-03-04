export type PackCopy = {
  masteryUnitLabel: string;
  masteryDisciplineLabel: string;
  nextStageDescription: string;
  onboardingIntro: string;
  onboardingIntensityLabel: string;
  onboardingIntensityHint: string;
  onboardingPaceLabel: string;
  onboardingPaceHint: string;
  onboardingPaceOptions: Array<{ id: 'slowburn' | 'balanced' | 'shock'; label: string }>;
  onboardingSubgenreLabel: string;
  onboardingSubgenreHint: string;
  startSeasonLabel: string;
};

const DEFAULT_COPY: PackCopy = {
  masteryUnitLabel: 'foundational films',
  masteryDisciplineLabel: 'cinema language',
  nextStageDescription: 'deeper thematic comparisons',
  onboardingIntro: 'Tune your next recommendations with a few quick taps.',
  onboardingIntensityLabel: 'Intensity',
  onboardingIntensityHint: 'Lower values favor atmosphere; higher values permit stronger intensity.',
  onboardingPaceLabel: 'Pace',
  onboardingPaceHint: 'Choose whether you want slow build, balanced rhythm, or immediate impact.',
  onboardingPaceOptions: [
    { id: 'slowburn', label: 'Slowburn' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'shock', label: 'Shock' },
  ],
  onboardingSubgenreLabel: 'Subgenres',
  onboardingSubgenreHint: 'Pick the niches you want first, then the engine broadens from feedback.',
  startSeasonLabel: 'Start Season',
};

const PACK_COPY: Record<string, PackCopy> = {
  horror: {
    masteryUnitLabel: 'foundational psychological horror films',
    masteryDisciplineLabel: 'horror language',
    nextStageDescription: 'harder thematic comparisons',
    onboardingIntro: 'Set your horror baseline so your first bundle fits your tolerance and pace.',
    onboardingIntensityLabel: 'Intensity',
    onboardingIntensityHint: 'Lower values favor dread and atmosphere; higher values allow stronger violence and shock.',
    onboardingPaceLabel: 'Pace',
    onboardingPaceHint: 'Slowburn builds dread, balanced mixes release, shock prioritizes immediate hits.',
    onboardingPaceOptions: [
      { id: 'slowburn', label: 'Slowburn' },
      { id: 'balanced', label: 'Balanced' },
      { id: 'shock', label: 'Shock' },
    ],
    onboardingSubgenreLabel: 'Subgenres',
    onboardingSubgenreHint: 'Start with your horror niches first; we expand once you rate and interact.',
    startSeasonLabel: 'Start Horror Season',
  },
  'cult-classics': {
    masteryUnitLabel: 'core cult classics',
    masteryDisciplineLabel: 'cult cinema literacy',
    nextStageDescription: 'deeper underground cinema comparisons',
    onboardingIntro: 'Define your cult lane so we start with the right midnight and underground canon.',
    onboardingIntensityLabel: 'Cult Intensity',
    onboardingIntensityHint: 'Lower values prioritize mood and oddity; higher values allow more transgressive picks.',
    onboardingPaceLabel: 'Viewing Rhythm',
    onboardingPaceHint: 'Slowburn favors atmospheric oddities, balanced mixes modes, shock leans to high-energy cult hits.',
    onboardingPaceOptions: [
      { id: 'slowburn', label: 'Atmospheric' },
      { id: 'balanced', label: 'Mixed Mode' },
      { id: 'shock', label: 'High Impact' },
    ],
    onboardingSubgenreLabel: 'Cult Lanes',
    onboardingSubgenreHint: 'Choose cult lanes you want first, then we widen across the season as feedback accumulates.',
    startSeasonLabel: 'Start Cult Classics Season',
  },
};

export function getPackCopy(packSlug: string | null | undefined): PackCopy {
  if (!packSlug) {
    return DEFAULT_COPY;
  }
  return PACK_COPY[packSlug] ?? DEFAULT_COPY;
}
