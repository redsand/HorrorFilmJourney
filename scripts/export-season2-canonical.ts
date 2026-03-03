import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const pack = await prisma.genrePack.findUnique({
      where: { slug: 'cult-classics' },
      select: {
        id: true,
        slug: true,
        name: true,
        isEnabled: true,
        season: {
          select: {
            slug: true,
            name: true,
            isActive: true,
          },
        },
        nodes: {
          orderBy: { orderIndex: 'asc' },
          select: {
            slug: true,
            name: true,
            orderIndex: true,
            movies: {
              orderBy: { rank: 'asc' },
              select: {
                rank: true,
                movie: {
                  select: {
                    tmdbId: true,
                    title: true,
                    year: true,
                    posterUrl: true,
                    genres: true,
                    director: true,
                    castTop: true,
                    ratings: {
                      orderBy: { source: 'asc' },
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
        },
      },
    });

    if (!pack) {
      throw new Error('cult-classics pack not found');
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      season: pack.season,
      pack: {
        slug: pack.slug,
        name: pack.name,
        isEnabled: pack.isEnabled,
      },
      summary: {
        nodeCount: pack.nodes.length,
        totalAssigned: pack.nodes.reduce((sum, node) => sum + node.movies.length, 0),
        uniqueTmdb: new Set(
          pack.nodes.flatMap((node) => node.movies.map((entry) => entry.movie.tmdbId)),
        ).size,
      },
      nodes: pack.nodes.map((node) => ({
        slug: node.slug,
        name: node.name,
        orderIndex: node.orderIndex,
        count: node.movies.length,
        titles: node.movies.map((entry) => ({
          rank: entry.rank,
          ...entry.movie,
        })),
      })),
    };

    const outputPath = resolve('docs/season/season-2-cult-classics-mastered.json');
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Season 2 canonical export written: ${outputPath}`);
    console.log(
      `Summary: nodes=${payload.summary.nodeCount} assigned=${payload.summary.totalAssigned} uniqueTmdb=${payload.summary.uniqueTmdb}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 2 canonical export failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

