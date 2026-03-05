import { InteractionStatus, PrismaClient } from '@prisma/client';
import { evaluateOffline, type EvalRecord } from '../src/lib/recommendation/offline-eval';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST;
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();

  try {
    const catalog = await prisma.movie.findMany({
      select: { tmdbId: true },
    });
    const catalogMovieIds = new Set(catalog.map((movie) => movie.tmdbId));

    const users = await prisma.user.findMany({
      select: { id: true },
    });

    const records: EvalRecord[] = [];
    const popularityByMovie = new Map<number, number>();

    for (const user of users) {
      // eslint-disable-next-line no-await-in-loop
      const latestBatch = await prisma.recommendationBatch.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: { rank: 'asc' }, include: { movie: { select: { tmdbId: true } } } } },
      });
      if (!latestBatch || latestBatch.items.length === 0) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const recommended = latestBatch.items.map((item) => item.movie.tmdbId);
      recommended.forEach((tmdbId) => {
        popularityByMovie.set(tmdbId, (popularityByMovie.get(tmdbId) ?? 0) + 1);
      });

      // Relevance label: positive feedback after the batch.
      // eslint-disable-next-line no-await-in-loop
      const interactions = await prisma.userMovieInteraction.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: latestBatch.createdAt },
          OR: [
            { status: InteractionStatus.WATCHED },
            { status: InteractionStatus.ALREADY_SEEN },
          ],
        },
        include: { movie: { select: { tmdbId: true } } },
      });
      const relevant = interactions
        .filter((item) => (item.rating ?? 0) >= 4 || item.recommend === true)
        .map((item) => item.movie.tmdbId);
      if (relevant.length === 0) {
        // eslint-disable-next-line no-continue
        continue;
      }

      records.push({
        userId: user.id,
        recommendedMovieIds: recommended,
        relevantMovieIds: relevant,
      });
    }

    const summary = evaluateOffline(records, catalogMovieIds, popularityByMovie);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Recommendation offline evaluation failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

