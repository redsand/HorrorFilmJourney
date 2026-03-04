import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

type ExportPayload = {
  generatedAt: string;
  season: {
    slug: string;
    name: string;
  };
  pack: {
    slug: string;
    name: string;
  };
  release: {
    id: string;
    runId: string;
    taxonomyVersion: string;
    publishedAt: string | null;
  };
  nodes: Array<{
    slug: string;
    name: string;
    orderIndex: number;
    taxonomyVersion: string;
  }>;
  assignments: Array<{
    nodeSlug: string;
    tmdbId: number;
    rank: number;
    tier: 'CORE' | 'EXTENDED';
    coreRank: number | null;
    source: string;
    score: number | null;
    finalScore: number;
    journeyScore: number;
    evidence: unknown;
  }>;
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const season = await prisma.season.findUnique({
      where: { slug: 'season-1' },
      select: {
        id: true,
        slug: true,
        name: true,
        packs: {
          where: { slug: 'horror' },
          select: {
            id: true,
            slug: true,
            name: true,
            nodes: {
              orderBy: { orderIndex: 'asc' },
              select: { slug: true, name: true, orderIndex: true, taxonomyVersion: true },
            },
            nodeReleases: {
              where: { isPublished: true },
              orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
              take: 1,
              select: { id: true, runId: true, taxonomyVersion: true, publishedAt: true },
            },
          },
        },
      },
    });
    if (!season || season.packs.length === 0) {
      throw new Error('Season 1 horror pack not found');
    }
    const pack = season.packs[0]!;
    const release = pack.nodeReleases[0];
    if (!release) {
      throw new Error('No published season-1/horror release found');
    }

    const rows = await prisma.nodeMovie.findMany({
      where: {
        node: { packId: pack.id },
        runId: release.runId,
        taxonomyVersion: release.taxonomyVersion,
      },
      select: {
        rank: true,
        tier: true,
        coreRank: true,
        source: true,
        score: true,
        finalScore: true,
        journeyScore: true,
        evidence: true,
        node: { select: { slug: true } },
        movie: { select: { tmdbId: true } },
      },
      orderBy: [{ node: { slug: 'asc' } }, { rank: 'asc' }],
    });

    const payload: ExportPayload = {
      generatedAt: new Date().toISOString(),
      season: {
        slug: season.slug,
        name: season.name,
      },
      pack: {
        slug: pack.slug,
        name: pack.name,
      },
      release: {
        id: release.id,
        runId: release.runId,
        taxonomyVersion: release.taxonomyVersion,
        publishedAt: release.publishedAt ? release.publishedAt.toISOString() : null,
      },
      nodes: pack.nodes.map((node) => ({
        slug: node.slug,
        name: node.name,
        orderIndex: node.orderIndex,
        taxonomyVersion: node.taxonomyVersion,
      })),
      assignments: rows.map((row) => ({
        nodeSlug: row.node.slug,
        tmdbId: row.movie.tmdbId,
        rank: row.rank,
        tier: row.tier,
        coreRank: row.coreRank,
        source: row.source,
        score: row.score ?? null,
        finalScore: row.finalScore,
        journeyScore: row.journeyScore,
        evidence: row.evidence ?? null,
      })),
    };

    const outDir = resolve('backups');
    await mkdir(outDir, { recursive: true });
    const outPath = resolve(outDir, `season1-horror-snapshot-${timestamp()}.json`);
    await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Season 1 snapshot export complete: ${outPath}`);
    console.log(`Summary: release=${payload.release.id} runId=${payload.release.runId} assignments=${payload.assignments.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 snapshot export failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

