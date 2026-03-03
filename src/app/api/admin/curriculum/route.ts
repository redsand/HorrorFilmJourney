import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { buildExternalLinkCoverageReport } from '@/lib/companion/external-reading-ops';
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
          seasonId: true,
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
                      externalReadings: {
                        select: {
                          id: true,
                          seasonId: true,
                          sourceName: true,
                          articleTitle: true,
                          url: true,
                          sourceType: true,
                        },
                      },
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
    seasonId: string;
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
          externalReadings: Array<{
            id: string;
            seasonId: string;
            sourceName: string;
            articleTitle: string;
            url: string;
            sourceType: string;
          }>;
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
          externalReadings: (Array.isArray(assignment.movie.externalReadings) ? assignment.movie.externalReadings : [])
            .filter((reading) => reading.id && reading.url && reading.seasonId === pack.seasonId)
            .map((reading) => ({
              id: reading.id,
              sourceName: reading.sourceName,
              articleTitle: reading.articleTitle,
              url: reading.url,
              sourceType: reading.sourceType.toLowerCase(),
            })),
        };
      });
      const titlesWithExternalLinks = titles.filter((title) => title.externalReadings.length > 0).length;
      const externalLinkCoveragePct = titles.length > 0
        ? Math.round((titlesWithExternalLinks / titles.length) * 10000) / 100
        : 0;

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
        titlesWithExternalLinks,
        externalLinkCoveragePct,
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
  const coverageReport = await buildExternalLinkCoverageReport(prisma, {
    seasonSlug: 'season-1',
    targetPct: Number.parseInt(process.env.EXTERNAL_LINKS_MIN_COVERAGE_PCT ?? '80', 10),
  });

  let topViewedMissingExternalLinks: Array<{ movieId: string; tmdbId: number; title: string; views: number }> = [];
  try {
    const topViewedMovieCounts = await prisma.userMovieInteraction.groupBy({
      by: ['movieId'],
      _count: { _all: true },
      orderBy: { _count: { movieId: 'desc' } },
      take: 20,
    });
    const topViewedMovieIds = topViewedMovieCounts.map((item) => item.movieId);
    const topViewedMovies = topViewedMovieIds.length > 0
      ? await prisma.movie.findMany({
        where: { id: { in: topViewedMovieIds } },
        select: {
          id: true,
          tmdbId: true,
          title: true,
          externalReadings: {
            where: { season: { slug: 'season-1' } },
            select: { id: true },
          },
        },
      })
      : [];
    const topViewedMovieById = new Map(topViewedMovies.map((movie) => [movie.id, movie]));
    topViewedMissingExternalLinks = topViewedMovieCounts
      .map((item) => {
        const movie = topViewedMovieById.get(item.movieId);
        if (!movie || movie.externalReadings.length > 0) {
          return null;
        }
        return {
          movieId: movie.id,
          tmdbId: movie.tmdbId,
          title: movie.title,
          views: item._count._all,
        };
      })
      .filter((row): row is { movieId: string; tmdbId: number; title: string; views: number } => row !== null);
  } catch {
    topViewedMissingExternalLinks = [];
  }

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
    externalLinksOps: {
      coverageReport,
      topViewedMissingExternalLinks,
    },
  });
}
