import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { evaluateCurriculumEligibility } from '@/lib/curriculum/eligibility';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const seasons = await prisma.season.findMany({
    orderBy: [{ isActive: 'desc' }, { slug: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
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
                      streamingCache: { select: { id: true }, take: 1 },
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

  if (seasons.length === 0) {
    return ok({
      activeSeason: null,
      seasons: [],
      packs: [],
    });
  }

  const mapPacks = (inputPacks: Array<{
    id: string;
    slug: string;
    name: string;
    isEnabled: boolean;
    nodes: Array<{
      id: string;
      slug: string;
      name: string;
      orderIndex: number;
      movies: Array<{
        rank: number;
        movie: {
          id: string;
          tmdbId: number;
          title: string;
          posterUrl: string;
          director: string | null;
          castTop: unknown;
          ratings: Array<{ source: string }>;
          streamingCache: Array<{ id: string }>;
        };
      }>;
    }>;
  }>) => inputPacks.map((pack) => {
    const tmdbFrequency = new Map<number, number>();
    pack.nodes.forEach((node) => {
      node.movies.forEach((assignment) => {
        const current = tmdbFrequency.get(assignment.movie.tmdbId) ?? 0;
        tmdbFrequency.set(assignment.movie.tmdbId, current + 1);
      });
    });
    const duplicateTmdbIds = [...tmdbFrequency.entries()]
      .filter(([, count]) => count > 1)
      .map(([tmdbId]) => tmdbId)
      .sort((a, b) => a - b);
    const totalAssignedTitles = pack.nodes.reduce((acc, node) => acc + node.movies.length, 0);
    const duplicateRatePct = totalAssignedTitles > 0
      ? Math.round((duplicateTmdbIds.length / totalAssignedTitles) * 10000) / 100
      : 0;
    return {
    id: pack.id,
    slug: pack.slug,
    name: pack.name,
    isEnabled: pack.isEnabled,
    totalAssignedTitles,
    duplicateTitlesCount: duplicateTmdbIds.length,
    duplicateRatePct,
    duplicateTmdbIds,
    nodes: pack.nodes.map((node) => {
      let eligibleTitles = 0;
      let missingPosterCount = 0;
      let missingRatingsCount = 0;
      let missingReceptionCount = 0;
      let missingCreditsCount = 0;
      let missingStreamingCount = 0;
      const titles = node.movies.map((assignment) => {
        const evaluation = evaluateCurriculumEligibility({
          posterUrl: assignment.movie.posterUrl,
          director: assignment.movie.director,
          castTop: assignment.movie.castTop,
          ratings: assignment.movie.ratings,
          hasStreamingData: assignment.movie.streamingCache.length > 0,
        });
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
        if (evaluation.missingStreaming) {
          missingStreamingCount += 1;
        }
        return {
          id: assignment.movie.id,
          rank: assignment.rank,
          tmdbId: assignment.movie.tmdbId,
          title: assignment.movie.title,
          posterUrl: assignment.movie.posterUrl,
          isEligible: evaluation.isEligible,
          completenessTier: evaluation.completenessTier,
          missing: {
            poster: evaluation.missingPoster,
            ratings: evaluation.missingRatings,
            reception: evaluation.missingReception,
            credits: evaluation.missingCredits,
            streaming: evaluation.missingStreaming,
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
        missingStreamingCount,
        titles,
        eligibilityCoverage: titles.length > 0
          ? Math.round((eligibleTitles / titles.length) * 100)
          : 0,
      };
    }),
  };
  });

  const activeSeason = seasons.find((season) => season.isActive) ?? null;
  const seasonPayload = seasons.map((season) => ({
    id: season.id,
    slug: season.slug,
    name: season.name,
    isActive: season.isActive,
    packs: mapPacks(season.packs),
  }));
  const activePacks = activeSeason ? mapPacks(activeSeason.packs) : [];

  return ok({
    activeSeason: activeSeason
      ? {
        id: activeSeason.id,
        slug: activeSeason.slug,
        name: activeSeason.name,
      }
      : null,
    seasons: seasonPayload,
    packs: activePacks,
  });
}
