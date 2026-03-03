import type { PrismaClient, Prisma } from '@prisma/client';
import { seasonsPacksEnabled } from '@/lib/feature-flags';

export type HistoryPackScope = 'current' | 'all';

export function parseHistoryPackScope(value: string | null): HistoryPackScope | null {
  if (value === null || value === '' || value === 'current') {
    return 'current';
  }
  if (value === 'all') {
    return 'all';
  }
  return null;
}

export async function resolveHistoryPackFilter(
  prisma: PrismaClient,
  userId: string,
  packScope: HistoryPackScope,
): Promise<Prisma.UserMovieInteractionWhereInput> {
  if (!seasonsPacksEnabled() || packScope === 'all') {
    return {};
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { selectedPackId: true },
  });

  if (!profile?.selectedPackId) {
    return {};
  }

  return {
    recommendationItem: {
      batch: {
        packId: profile.selectedPackId,
      },
    },
  };
}
