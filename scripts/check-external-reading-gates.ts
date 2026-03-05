import { PrismaClient } from '@prisma/client';
import { buildExternalLinkCoverageReport } from '../src/lib/companion/external-reading-ops.ts';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const seasonSlug = process.env.EXTERNAL_LINKS_GATE_SEASON ?? 'season-1';
    const minCoveragePct = Number.parseFloat(process.env.EXTERNAL_LINKS_MIN_COVERAGE_PCT ?? '80');
    const maxTopMissing = Number.parseInt(process.env.EXTERNAL_LINKS_MAX_TOP_MISSING ?? '20', 10);

    const coverage = await buildExternalLinkCoverageReport(prisma, {
      seasonSlug,
      targetPct: Number.isFinite(minCoveragePct) ? minCoveragePct : 80,
    });

    const topViewedMovieCounts = await prisma.userMovieInteraction.groupBy({
      by: ['movieId'],
      _count: { _all: true },
      orderBy: { _count: { movieId: 'desc' } },
      take: 20,
    });
    const movieIds = topViewedMovieCounts.map((row) => row.movieId);
    const season = await prisma.season.findUnique({
      where: { slug: seasonSlug },
      select: { id: true },
    });
    const movies = movieIds.length > 0
      ? await prisma.movie.findMany({
        where: { id: { in: movieIds } },
        select: {
          id: true,
          externalReadings: {
            where: season ? { seasonId: season.id } : undefined,
            select: { id: true },
          },
        },
      })
      : [];
    const movieById = new Map(movies.map((movie) => [movie.id, movie]));
    const topMissingCount = topViewedMovieCounts.filter((row) => {
      const movie = movieById.get(row.movieId);
      return movie ? movie.externalReadings.length === 0 : false;
    }).length;

    console.info('[external-links.gate]', {
      seasonSlug,
      overallCoveragePct: coverage.overallCoveragePct,
      targetPct: coverage.targetPct,
      topMissingCount,
      maxTopMissing,
    });

    if (!coverage.meetsTarget) {
      throw new Error(`Coverage gate failed: ${coverage.overallCoveragePct}% < target ${coverage.targetPct}%`);
    }
    if (topMissingCount > maxTopMissing) {
      throw new Error(`Top-missing gate failed: ${topMissingCount} > allowed ${maxTopMissing}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
