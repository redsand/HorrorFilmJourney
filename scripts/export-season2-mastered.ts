import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

type CurriculumSpec = {
  trackedCultSubgenres?: string[];
  nodes?: Array<{ slug: string; subgenres?: string[] }>;
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const specPath = resolve('docs/season/season-2-cult-classics-curriculum.json');
    const spec = JSON.parse(await readFile(specPath, 'utf8')) as CurriculumSpec;
    const nodeSubgenres = new Map(
      (spec.nodes ?? []).map((node) => [node.slug, Array.isArray(node.subgenres) ? node.subgenres : []] as const),
    );

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
      throw new Error('Pack cult-classics not found');
    }

    const totalAssigned = pack.nodes.reduce((acc, node) => acc + node.movies.length, 0);
    const uniqueTmdb = new Set(
      pack.nodes.flatMap((node) => node.movies.map((entry) => entry.movie.tmdbId)),
    ).size;

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
        totalAssigned,
        uniqueTmdb,
      },
      trackedCultSubgenres: Array.isArray(spec.trackedCultSubgenres) ? spec.trackedCultSubgenres : [],
      nodes: pack.nodes.map((node) => ({
        slug: node.slug,
        name: node.name,
        orderIndex: node.orderIndex,
        subgenres: nodeSubgenres.get(node.slug) ?? [],
        count: node.movies.length,
        titles: node.movies.map((entry) => ({
          rank: entry.rank,
          ...entry.movie,
        })),
      })),
    };

    const outDir = resolve('backups');
    await mkdir(outDir, { recursive: true });
    const outPath = resolve(outDir, `season2-cult-mastered-${timestamp()}.json`);
    await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Season 2 mastered export complete: ${outPath}`);
    console.log(`Summary: nodes=${payload.summary.nodeCount} assigned=${payload.summary.totalAssigned} unique=${payload.summary.uniqueTmdb}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 2 mastered export failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
