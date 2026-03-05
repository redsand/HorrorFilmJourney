type QuickPollOptionSet = {
  emotions: string[];
  workedBest: string[];
  agedWell: string[];
};

const SHARED_OPTIONS: Pick<QuickPollOptionSet, 'workedBest' | 'agedWell'> = {
  workedBest: ['pacing', 'atmosphere', 'performances', 'score', 'direction', 'editing'],
  agedWell: ['yes', 'mostly', 'mixed', 'no'],
};

const SEASON_1_OPTIONS: QuickPollOptionSet = {
  emotions: [
    'tense',
    'dread',
    'creepy',
    'disturbing',
    'surreal',
    'cathartic',
    'fun',
    'bored',
    'slow',
    'dull',
    'disappointed',
    'frustrated',
    'anxious',
    'sad',
    'angry',
    'uneasy',
    'confused',
  ],
  ...SHARED_OPTIONS,
};

const SEASON_2_OPTIONS: QuickPollOptionSet = {
  emotions: [
    'campy',
    'transgressive',
    'weird',
    'sleazy',
    'hilarious',
    'surreal',
    'fun',
    'cathartic',
    'shocking',
    'subversive',
    'retro',
    'cheesy',
    'bored',
    'dull',
    'disappointed',
    'frustrated',
    'confused',
  ],
  ...SHARED_OPTIONS,
};

const FALLBACK_OPTIONS: QuickPollOptionSet = SEASON_1_OPTIONS;

export function getSeasonQuickPollOptions(seasonSlug: string | null | undefined): QuickPollOptionSet {
  const normalized = (seasonSlug ?? '').trim().toLowerCase();
  if (normalized === 'season-2') {
    return SEASON_2_OPTIONS;
  }
  if (normalized === 'season-1') {
    return SEASON_1_OPTIONS;
  }
  return FALLBACK_OPTIONS;
}

