export type Season1PrepublishGateInput = {
  totalUniqueMovies: number;
  extendedUniqueOnlyMovies: number;
  eligiblePoolCount: number;
  journeyExtendedPassCount: number;
  allowShrink?: boolean;
  allowShrinkReason?: string | null;
  thresholds?: {
    totalUniqueMin?: number;
    extendedUniqueOnlyMin?: number;
    journeyRemovalRateMax?: number;
  };
};

export type Season1PrepublishGateResult = {
  checks: Array<{ name: string; pass: boolean; details: string }>;
  pass: boolean;
};

const DEFAULT_THRESHOLDS = {
  totalUniqueMin: 850,
  extendedUniqueOnlyMin: 100,
  journeyRemovalRateMax: 0.6,
} as const;

function toPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function evaluateSeason1PrepublishGate(input: Season1PrepublishGateInput): Season1PrepublishGateResult {
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const allowShrink = Boolean(input.allowShrink);
  const allowShrinkReason = input.allowShrinkReason?.trim() ?? '';

  const eligiblePool = Math.max(0, input.eligiblePoolCount);
  const journeyPass = Math.max(0, input.journeyExtendedPassCount);
  const journeyRemovalRate = eligiblePool > 0
    ? Math.max(0, Math.min(1, (eligiblePool - journeyPass) / eligiblePool))
    : 0;

  const checks: Array<{ name: string; pass: boolean; details: string }> = [];

  const totalUniquePass = input.totalUniqueMovies >= thresholds.totalUniqueMin;
  if (totalUniquePass) {
    checks.push({
      name: `totalUniqueMovies >= ${thresholds.totalUniqueMin}`,
      pass: true,
      details: `${input.totalUniqueMovies}`,
    });
  } else {
    const overridePass = allowShrink && allowShrinkReason.length > 0;
    checks.push({
      name: `totalUniqueMovies >= ${thresholds.totalUniqueMin} (or --allowShrink with reason)`,
      pass: overridePass,
      details: overridePass
        ? `override accepted: totalUniqueMovies=${input.totalUniqueMovies}; reason="${allowShrinkReason}"`
        : `totalUniqueMovies=${input.totalUniqueMovies}; overrideRequired=true`,
    });
  }

  checks.push({
    name: `extendedUniqueOnly >= ${thresholds.extendedUniqueOnlyMin}`,
    pass: input.extendedUniqueOnlyMovies >= thresholds.extendedUniqueOnlyMin,
    details: `${input.extendedUniqueOnlyMovies}`,
  });

  checks.push({
    name: `journey gate removals <= ${toPct(thresholds.journeyRemovalRateMax)}`,
    pass: journeyRemovalRate <= thresholds.journeyRemovalRateMax,
    details: `eligible=${eligiblePool}, journeyExtendedPass=${journeyPass}, removalRate=${toPct(journeyRemovalRate)}`,
  });

  return {
    checks,
    pass: checks.every((check) => check.pass),
  };
}
