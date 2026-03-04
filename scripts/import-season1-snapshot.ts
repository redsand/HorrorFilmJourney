import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';

type SnapshotNode = {
  slug: string;
  name: string;
  orderIndex: number;
  taxonomyVersion: string;
};

type SnapshotAssignment = {
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
};

type SnapshotPayload = {
  season: {
    slug: string;
    name: string;
  };
  pack: {
    slug: string;
    name: string;
  };
  release: {
    runId: string;
    taxonomyVersion: string;
  };
  nodes: SnapshotNode[];
  assignments: SnapshotAssignment[];
};

type CliOptions = {
  input: string;
  publish: boolean;
};

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const inputIndex = args.findIndex((arg) => arg === '--input');
  if (inputIndex === -1 || !args[inputIndex + 1]) {
    throw new Error('Missing required flag: --input <path-to-season1-snapshot.json>');
  }
  const publish = !args.includes('--no-publish');
  return {
    input: args[inputIndex + 1]!,
    publish,
  };
}

function isValidPayload(value: unknown): value is SnapshotPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SnapshotPayload>;
  return Boolean(
    payload.season && typeof payload.season.slug === 'string' && typeof payload.season.name === 'string'
    && payload.pack && typeof payload.pack.slug === 'string' && typeof payload.pack.name === 'string'
    && payload.release && typeof payload.release.runId === 'string' && typeof payload.release.taxonomyVersion === 'string'
    && Array.isArray(payload.nodes)
    && Array.isArray(payload.assignments),
  );
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as Prisma.InputJsonValue;
}

async function main(): Promise<void> {
  const cli = parseCli();
  const raw = await readFile(resolve(cli.input), 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isValidPayload(parsed)) {
    throw new Error('Invalid Season 1 snapshot payload');
  }

  const prisma = new PrismaClient();
  try {
    const season = await prisma.season.upsert({
      where: { slug: parsed.season.slug },
      create: { slug: parsed.season.slug, name: parsed.season.name, isActive: true },
      update: { name: parsed.season.name },
      select: { id: true, slug: true },
    });

    const pack = await prisma.genrePack.upsert({
      where: { slug: parsed.pack.slug },
      create: {
        slug: parsed.pack.slug,
        name: parsed.pack.name,
        seasonId: season.id,
        isEnabled: true,
        primaryGenre: 'horror',
        description: 'Foundational horror journey pack.',
      },
      update: {
        name: parsed.pack.name,
        seasonId: season.id,
        isEnabled: true,
      },
      select: { id: true, slug: true },
    });

    const uniqueTmdb = [...new Set(parsed.assignments.map((row) => row.tmdbId).filter((id) => Number.isInteger(id) && id > 0))];
    const movies = await prisma.movie.findMany({
      where: { tmdbId: { in: uniqueTmdb } },
      select: { id: true, tmdbId: true },
    });
    const movieIdByTmdb = new Map(movies.map((movie) => [movie.tmdbId, movie.id] as const));
    const missingTmdbIds = uniqueTmdb.filter((tmdbId) => !movieIdByTmdb.has(tmdbId));
    if (missingTmdbIds.length > 0) {
      throw new Error(
        `Remote catalog missing ${missingTmdbIds.length} TMDB ids required by snapshot. First missing: ${missingTmdbIds.slice(0, 25).join(', ')}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      const nodeIdBySlug = new Map<string, string>();
      for (const node of parsed.nodes) {
        // eslint-disable-next-line no-await-in-loop
        const persisted = await tx.journeyNode.upsert({
          where: { packId_slug: { packId: pack.id, slug: node.slug } },
          create: {
            packId: pack.id,
            slug: node.slug,
            name: node.name,
            taxonomyVersion: node.taxonomyVersion,
            learningObjective: `${node.name} learning objective.`,
            whatToNotice: [],
            eraSubgenreFocus: 'Season 1',
            spoilerPolicyDefault: 'NO_SPOILERS',
            orderIndex: node.orderIndex,
          },
          update: {
            name: node.name,
            taxonomyVersion: node.taxonomyVersion,
            orderIndex: node.orderIndex,
          },
          select: { id: true, slug: true },
        });
        nodeIdBySlug.set(persisted.slug, persisted.id);
      }

      await tx.nodeMovie.deleteMany({ where: { nodeId: { in: [...nodeIdBySlug.values()] } } });

      if (cli.publish) {
        await tx.seasonNodeRelease.updateMany({
          where: { seasonId: season.id, packId: pack.id, isPublished: true },
          data: { isPublished: false, publishedAt: null },
        });
      }

      const release = await tx.seasonNodeRelease.upsert({
        where: {
          packId_taxonomyVersion_runId: {
            packId: pack.id,
            taxonomyVersion: parsed.release.taxonomyVersion,
            runId: parsed.release.runId,
          },
        },
        create: {
          seasonId: season.id,
          packId: pack.id,
          taxonomyVersion: parsed.release.taxonomyVersion,
          runId: parsed.release.runId,
          isPublished: cli.publish,
          publishedAt: cli.publish ? new Date() : null,
          metadata: {
            source: 'import-season1-snapshot',
            importedAt: new Date().toISOString(),
            input: cli.input,
          },
        },
        update: {
          isPublished: cli.publish,
          publishedAt: cli.publish ? new Date() : null,
          metadata: {
            source: 'import-season1-snapshot',
            importedAt: new Date().toISOString(),
            input: cli.input,
          },
        },
        select: { id: true },
      });

      await tx.seasonNodeReleaseItem.deleteMany({ where: { releaseId: release.id } });

      if (parsed.assignments.length > 0) {
        await tx.seasonNodeReleaseItem.createMany({
          data: parsed.assignments.map((row) => ({
            releaseId: release.id,
            nodeSlug: row.nodeSlug,
            movieId: movieIdByTmdb.get(row.tmdbId)!,
            rank: row.rank,
            source: row.source,
            score: row.score,
            evidence: asJson(row.evidence),
          })),
          skipDuplicates: true,
        });

        await tx.nodeMovie.createMany({
          data: parsed.assignments.map((row) => ({
            nodeId: nodeIdBySlug.get(row.nodeSlug)!,
            movieId: movieIdByTmdb.get(row.tmdbId)!,
            rank: row.rank,
            tier: row.tier,
            coreRank: row.coreRank,
            source: row.source,
            score: row.score,
            finalScore: row.finalScore,
            journeyScore: row.journeyScore,
            evidence: asJson(row.evidence),
            runId: parsed.release.runId,
            taxonomyVersion: parsed.release.taxonomyVersion,
          })),
          skipDuplicates: true,
        });
      }
    });

    console.log(
      `Season 1 snapshot import complete: input=${resolve(cli.input)} season=${parsed.season.slug} pack=${parsed.pack.slug} runId=${parsed.release.runId} taxonomy=${parsed.release.taxonomyVersion} assignments=${parsed.assignments.length} publish=${cli.publish}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 snapshot import failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

