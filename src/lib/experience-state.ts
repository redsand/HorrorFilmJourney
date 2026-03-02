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
    cards: Array<{
      id: string;
      rank: number;
      movie: {
        id: string;
        tmdbId: number;
        title: string;
        year: number | null;
        posterUrl: string;
      };
      narrative: {
        whyImportant: string;
        whatItTeaches: string;
        historicalContext: string;
        nextStepHint: string;
        watchFor: unknown;
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
      bundle: {
        id: latestBatch.id,
        createdAt: latestBatch.createdAt.toISOString(),
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
            spoilerPolicy: item.spoilerPolicy,
          },
        })),
      },
    };
  }

  if (latestInteraction) {
    return {
      state: 'SHOW_QUICK_POLL',
      quickPoll: {
        prompt: 'Tell us quickly how the latest watch decision felt.',
      },
    };
  }

  if (latestBatch.items.length > 0) {
    return {
      state: 'SHOW_RECOMMENDATION_BUNDLE',
      bundle: {
        id: latestBatch.id,
        createdAt: latestBatch.createdAt.toISOString(),
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
            spoilerPolicy: item.spoilerPolicy,
          },
        })),
      },
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
