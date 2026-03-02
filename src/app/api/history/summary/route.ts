import { InteractionStatus } from '@prisma/client';
import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/request-context';

function bucketDecade(year: number | null): string | null {
  if (!year) {
    return null;
  }
  return `${Math.floor(year / 10) * 10}s`;
}

function addTags(counter: Map<string, number>, values: unknown): void {
  if (!Array.isArray(values)) {
    return;
  }

  values.forEach((item) => {
    if (typeof item === 'string' && item.length > 0) {
      counter.set(item, (counter.get(item) ?? 0) + 1);
    }
  });
}

export async function GET(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { userId, error } = await getCurrentUserId(request, prisma);
  if (error || !userId) {
    return fail(error ?? { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' }, 400);
  }

  const interactions = await prisma.userMovieInteraction.findMany({
    where: { userId },
    include: {
      movie: {
        select: {
          year: true,
        },
      },
    },
  });

  const countsByStatus: Record<InteractionStatus, number> = {
    WATCHED: 0,
    ALREADY_SEEN: 0,
    SKIPPED: 0,
    WANT_TO_WATCH: 0,
  };

  let ratingSum = 0;
  let ratingCount = 0;
  const eraPreferences = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  interactions.forEach((interaction) => {
    countsByStatus[interaction.status] += 1;

    if ((interaction.status === InteractionStatus.WATCHED || interaction.status === InteractionStatus.ALREADY_SEEN) && typeof interaction.rating === 'number') {
      ratingSum += interaction.rating;
      ratingCount += 1;
    }

    const decade = bucketDecade(interaction.movie.year);
    if (decade) {
      eraPreferences.set(decade, (eraPreferences.get(decade) ?? 0) + 1);
    }

    addTags(tagCounts, interaction.emotions);
    addTags(tagCounts, interaction.workedBest);
  });

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  return ok(
    {
      countsByStatus,
      avgRatingWatchedOrAlreadySeen: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null,
      eraPreferences: Object.fromEntries([...eraPreferences.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      topTags,
    },
    { status: 200 },
  );
}
