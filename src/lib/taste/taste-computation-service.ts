import { InteractionStatus, PrismaClient, type Prisma } from '@prisma/client';
import { tasteSnapshotInterval } from '@/lib/taste/taste-evolution-service';

type TraitSnapshot = {
  intensityPreference: number;
  pacingPreference: number;
  psychologicalVsSupernatural: number;
  goreTolerance: number;
  ambiguityTolerance: number;
  nostalgiaBias: number;
  auteurAffinity: number;
};

type InteractionRow = {
  status: InteractionStatus;
  rating: number | null;
  intensity: number | null;
  recommend: boolean | null;
  emotions: Prisma.JsonValue | null;
  workedBest: Prisma.JsonValue | null;
  createdAt: Date;
  movie: {
    genres: Prisma.JsonValue | null;
    year: number | null;
  };
};

const NEGATIVE_EMOTIONS = new Set([
  'bored',
  'boring',
  'slow',
  'dull',
  'disappointed',
  'frustrated',
  'angry',
  'annoyed',
  'tedious',
  'flat',
  'unengaging',
]);

const POSITIVE_EMOTIONS = new Set([
  'fun',
  'cathartic',
  'tense',
  'dread',
  'creepy',
  'disturbing',
  'surreal',
  'uneasy',
  'anxious',
]);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toTagList(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function mapYearToNostalgia(year: number | null): number {
  if (!year) {
    return 0.5;
  }
  if (year <= 1989) {
    return 0.95;
  }
  if (year <= 1999) {
    return 0.85;
  }
  if (year <= 2009) {
    return 0.65;
  }
  if (year <= 2019) {
    return 0.45;
  }
  return 0.3;
}

function hasAny(tags: string[], targets: string[]): boolean {
  return targets.some((target) => tags.includes(target));
}

function mapGenresToPacing(genres: string[]): number {
  if (hasAny(genres, ['slasher', 'body-horror', 'action-horror', 'survival'])) {
    return 0.8;
  }
  if (hasAny(genres, ['psychological', 'gothic', 'supernatural'])) {
    return 0.3;
  }
  return 0.5;
}

function mapGenresToPsyVsSuper(genres: string[]): number {
  const hasPsych = hasAny(genres, ['psychological', 'mind-bender', 'paranoia']);
  const hasSuper = hasAny(genres, ['supernatural', 'occult', 'demonic', 'ghost']);
  if (hasPsych && !hasSuper) {
    return 1;
  }
  if (hasSuper && !hasPsych) {
    return 0;
  }
  return 0.5;
}

function mapGenresToGore(genres: string[]): number {
  if (hasAny(genres, ['gore', 'body-horror', 'slasher', 'splatter'])) {
    return 0.95;
  }
  if (hasAny(genres, ['psychological', 'gothic', 'supernatural'])) {
    return 0.35;
  }
  return 0.55;
}

function mapGenresToAmbiguity(genres: string[]): number {
  if (hasAny(genres, ['psychological', 'surreal', 'mystery', 'arthouse'])) {
    return 0.85;
  }
  if (hasAny(genres, ['slasher', 'body-horror'])) {
    return 0.3;
  }
  return 0.5;
}

function mapWorkedBestToAuteur(workedBest: string[]): number {
  const crafted = workedBest.filter((item) => ['direction', 'performances', 'score', 'editing', 'atmosphere'].includes(item)).length;
  if (crafted === 0) {
    return 0.45;
  }
  return clamp01(0.45 + (crafted * 0.15));
}

function mapInteractionToDirection(input: {
  status: InteractionStatus;
  rating: number | null;
  recommend: boolean | null;
  emotions: string[];
}): number {
  const statusBase =
    input.status === InteractionStatus.WATCHED ? 0.2
      : input.status === InteractionStatus.ALREADY_SEEN ? 0.12
        : 0;
  const ratingCentered = typeof input.rating === 'number' ? (input.rating - 3) / 2 : 0;
  const recommendSignal = input.recommend === null ? 0 : input.recommend ? 0.2 : -0.25;
  const negativeEmotionHits = input.emotions.filter((item) => NEGATIVE_EMOTIONS.has(item)).length;
  const positiveEmotionHits = input.emotions.filter((item) => POSITIVE_EMOTIONS.has(item)).length;
  const emotionSignal = (positiveEmotionHits * 0.1) - (negativeEmotionHits * 0.22);
  return Math.max(-1, Math.min(1, statusBase + ratingCentered + recommendSignal + emotionSignal));
}

function applyTraitContribution(base: number, direction: number, recencyWeight: number): { signed: number; weight: number } {
  const signed = (base - 0.5) * 2;
  const weight = recencyWeight * Math.max(0.35, Math.abs(direction));
  return { signed: signed * direction, weight };
}

function computeTraitFromInteractions(
  interactions: InteractionRow[],
  mapper: (input: { interaction: InteractionRow; genres: string[]; emotions: string[]; workedBest: string[] }) => number,
): number {
  if (interactions.length === 0) {
    return 0.5;
  }
  let weightedSignedSum = 0;
  let totalWeight = 0;
  interactions.forEach((interaction, index) => {
    const recencyWeight = Math.pow(0.92, index);
    const emotions = toTagList(interaction.emotions);
    const workedBest = toTagList(interaction.workedBest);
    const genres = toTagList(interaction.movie.genres);
    const base = clamp01(mapper({ interaction, genres, emotions, workedBest }));
    const direction = mapInteractionToDirection({
      status: interaction.status,
      rating: interaction.rating,
      recommend: interaction.recommend,
      emotions,
    });
    const contribution = applyTraitContribution(base, direction, recencyWeight);
    weightedSignedSum += contribution.signed * contribution.weight;
    totalWeight += contribution.weight;
  });
  if (totalWeight <= 0) {
    return 0.5;
  }
  return clamp01(0.5 + ((weightedSignedSum / totalWeight) * 0.5));
}

export class TasteComputationService {
  constructor(private readonly prisma: PrismaClient) {}

  private async maybeSaveSnapshot(userId: string, traits: TraitSnapshot, takenAt: Date): Promise<void> {
    const interval = tasteSnapshotInterval();
    const latestSnapshot = await this.prisma.tasteSnapshot.findFirst({
      where: { userId },
      orderBy: { takenAt: 'desc' },
      select: { takenAt: true },
    });

    const countWhereBase = {
      userId,
      status: { in: [InteractionStatus.WATCHED, InteractionStatus.ALREADY_SEEN] as InteractionStatus[] },
    };

    const interactionsSinceLastSnapshot = latestSnapshot
      ? await this.prisma.userMovieInteraction.count({
        where: {
          ...countWhereBase,
          createdAt: { gt: latestSnapshot.takenAt },
        },
      })
      : await this.prisma.userMovieInteraction.count({
        where: countWhereBase,
      });

    if (interactionsSinceLastSnapshot < interval) {
      return;
    }

    await this.prisma.tasteSnapshot.create({
      data: {
        userId,
        takenAt,
        intensityPreference: traits.intensityPreference,
        pacingPreference: traits.pacingPreference,
        psychologicalVsSupernatural: traits.psychologicalVsSupernatural,
        goreTolerance: traits.goreTolerance,
        ambiguityTolerance: traits.ambiguityTolerance,
        nostalgiaBias: traits.nostalgiaBias,
        auteurAffinity: traits.auteurAffinity,
      },
    });
  }

  async computeTasteProfile(userId: string): Promise<TraitSnapshot & { lastComputedAt: Date }> {
    const interactions = await this.prisma.userMovieInteraction.findMany({
      where: {
        userId,
        status: { in: [InteractionStatus.WATCHED, InteractionStatus.ALREADY_SEEN] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        rating: true,
        intensity: true,
        recommend: true,
        emotions: true,
        workedBest: true,
        createdAt: true,
        movie: { select: { genres: true, year: true } },
      },
    });

    const intensityPreference = computeTraitFromInteractions(interactions, ({ interaction }) => {
      if (typeof interaction.intensity === 'number') {
        return interaction.intensity / 5;
      }
      if (typeof interaction.rating === 'number') {
        return interaction.rating / 5;
      }
      return 0.5;
    });

    const pacingPreference = computeTraitFromInteractions(interactions, ({ genres, emotions }) => {
      if (emotions.includes('slow') || emotions.includes('dull') || emotions.includes('bored')) {
        return 0.85;
      }
      return mapGenresToPacing(genres);
    });

    const psychologicalVsSupernatural = computeTraitFromInteractions(interactions, ({ genres }) => mapGenresToPsyVsSuper(genres));
    const goreTolerance = computeTraitFromInteractions(interactions, ({ genres, interaction }) => {
      const genreBase = mapGenresToGore(genres);
      if (typeof interaction.intensity === 'number' && interaction.intensity >= 4) {
        return clamp01(Math.max(genreBase, 0.7));
      }
      return genreBase;
    });
    const ambiguityTolerance = computeTraitFromInteractions(interactions, ({ genres, emotions }) => {
      const base = mapGenresToAmbiguity(genres);
      if (emotions.includes('confused') || emotions.includes('surreal')) {
        return clamp01(base + 0.15);
      }
      return base;
    });
    const nostalgiaBias = computeTraitFromInteractions(interactions, ({ interaction }) => mapYearToNostalgia(interaction.movie.year));
    const auteurAffinity = computeTraitFromInteractions(interactions, ({ workedBest }) => mapWorkedBestToAuteur(workedBest));

    const lastComputedAt = new Date();
    await this.prisma.userTasteProfile.upsert({
      where: { userId },
      create: {
        userId,
        intensityPreference,
        pacingPreference,
        psychologicalVsSupernatural,
        goreTolerance,
        ambiguityTolerance,
        nostalgiaBias,
        auteurAffinity,
        lastComputedAt,
      },
      update: {
        intensityPreference,
        pacingPreference,
        psychologicalVsSupernatural,
        goreTolerance,
        ambiguityTolerance,
        nostalgiaBias,
        auteurAffinity,
        lastComputedAt,
      },
    });

    await this.maybeSaveSnapshot(userId, {
      intensityPreference,
      pacingPreference,
      psychologicalVsSupernatural,
      goreTolerance,
      ambiguityTolerance,
      nostalgiaBias,
      auteurAffinity,
    }, lastComputedAt);

    return {
      intensityPreference,
      pacingPreference,
      psychologicalVsSupernatural,
      goreTolerance,
      ambiguityTolerance,
      nostalgiaBias,
      auteurAffinity,
      lastComputedAt,
    };
  }
}

export function summarizeTasteProfile(traits: TraitSnapshot): string {
  const pace = traits.pacingPreference >= 0.65 ? 'faster, high-momentum stories' : traits.pacingPreference <= 0.35 ? 'slow-burn, atmospheric stories' : 'balanced pacing';
  const psychVsSuper = traits.psychologicalVsSupernatural >= 0.6 ? 'psychological horror' : traits.psychologicalVsSupernatural <= 0.4 ? 'supernatural horror' : 'a mix of psychological and supernatural horror';
  const gore = traits.goreTolerance >= 0.65 ? 'higher gore intensity' : traits.goreTolerance <= 0.35 ? 'low-gore tension' : 'moderate gore';
  const nostalgia = traits.nostalgiaBias >= 0.6 ? 'older catalog titles' : traits.nostalgiaBias <= 0.4 ? 'modern releases' : 'a cross-era blend';
  return `Your cinematic DNA currently favors ${pace}, leans toward ${psychVsSuper}, and trends toward ${gore}. You also show a bias toward ${nostalgia}.`;
}
