import { InteractionStatus, PrismaClient } from '@prisma/client';

export type ExperienceState =
  | 'ONBOARDING_NEEDED'
  | 'SHOW_RECOMMENDATION_BUNDLE'
  | 'SHOW_QUICK_POLL'
  | 'SHOW_HISTORY';

export type ExperiencePayload = {
  state: ExperienceState;
  onboardingQuestions?: string[];
  bundle?: {
    id: string;
    createdAt: string;
    journeyNode?: string | null;
    cards: Array<{
      id: string;
      rank: number;
      movie: {
        id: string;
        tmdbId: number;
        title: string;
        year: number | null;
        posterUrl: string;
        ratings: Array<{
          source: string;
          value: number;
          scale: string;
          rawValue: string | null;
        }>;
      };
      narrative: {
        whyImportant: string;
        whatItTeaches: string;
        historicalContext: string;
        nextStepHint: string;
        watchFor: unknown;
        reception: unknown;
        castHighlights: unknown;
        streaming: unknown;
        spoilerPolicy: string;
      };
    }>;
  };
  quickPoll?: {
    prompt: string;
  };
  history?: {
    recentCount: number;
  };
};

const ONBOARDING_QUESTIONS = [
  'How intense do you want your next watch to feel (1-5)?',
  'Do you prefer slowburn, balanced, or shock pacing?',
  'Any specific horror subgenres you want more of?',
];

export async function getExperience(
  userId: string,
  prisma: PrismaClient,
): Promise<ExperiencePayload> {
  function mapBatch(
    latestBatch: {
      id: string;
      createdAt: Date;
      journeyNode: string | null;
      items: Array<{
        id: string;
        rank: number;
        whyImportant: string;
        whatItTeaches: string;
        historicalContext: string;
        nextStepHint: string;
        watchFor: unknown;
        reception: unknown;
        castHighlights: unknown;
        streaming: unknown;
        spoilerPolicy: string;
        movie: {
          id: string;
          tmdbId: number;
          title: string;
          year: number | null;
          posterUrl: string;
          ratings: Array<{
            source: string;
            value: number;
            scale: string;
            rawValue: string | null;
          }>;
        };
      }>;
    },
  ) {
    return {
      id: latestBatch.id,
      createdAt: latestBatch.createdAt.toISOString(),
      journeyNode: latestBatch.journeyNode,
      cards: latestBatch.items.map((item) => ({
        id: item.id,
        rank: item.rank,
        movie: item.movie,
        narrative: {
          whyImportant: item.whyImportant,
          whatItTeaches: item.whatItTeaches,
          historicalContext: item.historicalContext,
          nextStepHint: item.nextStepHint,
          watchFor: item.watchFor,
          reception: item.reception,
          castHighlights: item.castHighlights,
          streaming: item.streaming,
          spoilerPolicy: item.spoilerPolicy,
        },
      })),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  if (!user || !user.profile || !user.profile.onboardingCompleted) {
    return {
      state: 'ONBOARDING_NEEDED',
      onboardingQuestions: ONBOARDING_QUESTIONS,
    };
  }

  const latestBatch = await prisma.recommendationBatch.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        orderBy: { rank: 'asc' },
        include: {
          movie: {
            select: {
              id: true,
              tmdbId: true,
              title: true,
              year: true,
              posterUrl: true,
              ratings: {
                select: {
                  source: true,
                  value: true,
                  scale: true,
                  rawValue: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!latestBatch) {
    return {
      state: 'SHOW_RECOMMENDATION_BUNDLE',
      bundle: undefined,
    };
  }

  const latestInteraction = await prisma.userMovieInteraction.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (
    latestInteraction &&
    (latestInteraction.status === InteractionStatus.WATCHED ||
      latestInteraction.status === InteractionStatus.ALREADY_SEEN)
  ) {
    return {
      state: 'SHOW_RECOMMENDATION_BUNDLE',
      bundle: mapBatch(latestBatch),
    };
  }

  if (latestInteraction) {
    return {
      state: 'SHOW_QUICK_POLL',
      quickPoll: {
        prompt: 'Tell us quickly how the latest watch decision felt.',
      },
      bundle: mapBatch(latestBatch),
    };
  }

  if (latestBatch.items.length > 0) {
    return {
      state: 'SHOW_RECOMMENDATION_BUNDLE',
      bundle: mapBatch(latestBatch),
    };
  }

  const historyCount = await prisma.userMovieInteraction.count({ where: { userId } });
  return {
    state: 'SHOW_HISTORY',
    history: {
      recentCount: historyCount,
    },
  };
}
