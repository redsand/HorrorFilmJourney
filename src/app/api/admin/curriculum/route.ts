import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

type RatingRow = { source: string };
type CastTopRow = Array<{ name?: string; role?: string }>;

function parseCastTop(value: unknown): CastTopRow {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is { name?: string; role?: string } => {
    return typeof entry === 'object' && entry !== null;
  });
}

function evaluateEligibility(movie: {
  posterUrl: string;
  director: string | null;
  castTop: unknown;
  ratings: RatingRow[];
}): {
  isEligible: boolean;
  missingPoster: boolean;
  missingRatings: boolean;
  missingReception: boolean;
  missingCredits: boolean;
} {
  const ratingSources = new Set(movie.ratings.map((rating) => rating.source.toUpperCase()));
  const hasPoster = movie.posterUrl.trim().length > 0;
  const hasImdb = ratingSources.has('IMDB');
  const hasAdditional = ratingSources.size >= 2;
  const hasReception = ratingSources.has('ROTTEN_TOMATOES') || ratingSources.has('METACRITIC');
  const cast = parseCastTop(movie.castTop);
  const hasCredits = Boolean(movie.director && movie.director.trim().length > 0) && cast.length > 0;

  return {
    isEligible: hasPoster && hasImdb && hasAdditional && hasReception && hasCredits,
    missingPoster: !hasPoster,
    missingRatings: !(hasImdb && hasAdditional),
    missingReception: !hasReception,
    missingCredits: !hasCredits,
  };
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const season = await prisma.season.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      packs: {
        orderBy: { slug: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          isEnabled: true,
          nodes: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              slug: true,
              name: true,
              orderIndex: true,
              movies: {
                orderBy: { rank: 'asc' },
                select: {
                  rank: true,
                  movie: {
                    select: {
                      id: true,
                      tmdbId: true,
                      title: true,
                      posterUrl: true,
                      director: true,
                      castTop: true,
                      ratings: { select: { source: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!season) {
    return ok({
      activeSeason: null,
      packs: [],
    });
  }

  const packs = season.packs.map((pack) => ({
    id: pack.id,
    slug: pack.slug,
    name: pack.name,
    isEnabled: pack.isEnabled,
    nodes: pack.nodes.map((node) => {
      let eligibleTitles = 0;
      let missingPosterCount = 0;
      let missingRatingsCount = 0;
      let missingReceptionCount = 0;
      let missingCreditsCount = 0;
      const titles = node.movies.map((assignment) => {
        const evaluation = evaluateEligibility(assignment.movie);
        if (evaluation.isEligible) {
          eligibleTitles += 1;
        }
        if (evaluation.missingPoster) {
          missingPosterCount += 1;
        }
        if (evaluation.missingRatings) {
          missingRatingsCount += 1;
        }
        if (evaluation.missingReception) {
          missingReceptionCount += 1;
        }
        if (evaluation.missingCredits) {
          missingCreditsCount += 1;
        }
        return {
          id: assignment.movie.id,
          rank: assignment.rank,
          tmdbId: assignment.movie.tmdbId,
          title: assignment.movie.title,
          posterUrl: assignment.movie.posterUrl,
          isEligible: evaluation.isEligible,
          missing: {
            poster: evaluation.missingPoster,
            ratings: evaluation.missingRatings,
            reception: evaluation.missingReception,
            credits: evaluation.missingCredits,
          },
        };
      });

      return {
        id: node.id,
        slug: node.slug,
        name: node.name,
        orderIndex: node.orderIndex,
        totalTitles: titles.length,
        eligibleTitles,
        missingPosterCount,
        missingRatingsCount,
        missingReceptionCount,
        missingCreditsCount,
        titles,
      };
    }),
  }));

  return ok({
    activeSeason: {
      id: season.id,
      slug: season.slug,
      name: season.name,
    },
    packs,
  });
}
