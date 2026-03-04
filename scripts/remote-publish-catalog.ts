import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  parseFlag,
  parseOption,
  readVerificationStamp,
  VERIFICATION_STAMP_PATH,
} from './catalog-release-utils.ts';

type BackupPayload = {
  schemaVersion: 1;
  generatedAt: string;
  remoteUrlRedacted: string;
  seasonSlug: 'season-1';
  packSlug: 'horror';
  currentPublishedReleaseId: string | null;
  currentPublishedRunId: string | null;
  currentPublishedTaxonomyVersion: string | null;
  journeyNodes: Array<{
    slug: string;
    name: string;
    orderIndex: number;
    taxonomyVersion: string;
  }>;
  nodeMovies: Array<{
    nodeSlug: string;
    movieTmdbId: number;
    rank: number;
    source: string;
    score: number | null;
    runId: string | null;
    taxonomyVersion: string;
    evidence: unknown;
  }>;
  releases: Array<{
    id: string;
    taxonomyVersion: string;
    runId: string;
    isPublished: boolean;
    publishedAt: string | null;
    createdAt: string;
    itemCount: number;
  }>;
};

function redactDatabaseUrl(url: string): string {
  return url.replace(/:\/\/([^:@]+):([^@]+)@/, '://$1:***@');
}

function requiredFlag(argv: string[], flag: string): void {
  if (!parseFlag(argv, flag)) {
    throw new Error(`Missing required flag ${flag}`);
  }
}

async function resolveLocalPublished(local: PrismaClient) {
  const season = await local.season.findUnique({
    where: { slug: 'season-1' },
    select: {
      id: true,
      packs: {
        where: { slug: 'horror' },
        select: {
          id: true,
          name: true,
          nodes: {
            orderBy: { orderIndex: 'asc' },
            select: { slug: true, name: true, orderIndex: true, taxonomyVersion: true },
          },
          nodeReleases: {
            where: { isPublished: true },
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: {
              id: true,
              taxonomyVersion: true,
              runId: true,
              items: {
                orderBy: [{ nodeSlug: 'asc' }, { rank: 'asc' }],
                select: {
                  nodeSlug: true,
                  rank: true,
                  source: true,
                  score: true,
                  evidence: true,
                  movie: { select: { tmdbId: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!season || season.packs.length === 0) {
    throw new Error('Local Season 1 horror pack not found');
  }
  const pack = season.packs[0]!;
  const release = pack.nodeReleases[0];
  if (!release) {
    throw new Error('Local published Season 1 snapshot not found. Run local:build-catalog first.');
  }
  return { season, pack, release };
}

async function backupRemoteState(remote: PrismaClient, remoteUrl: string, outputPath?: string): Promise<string> {
  const season = await remote.season.findUnique({
    where: { slug: 'season-1' },
    select: {
      id: true,
      packs: {
        where: { slug: 'horror' },
        select: {
          id: true,
          nodes: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              slug: true,
              name: true,
              orderIndex: true,
              taxonomyVersion: true,
              movies: {
                orderBy: { rank: 'asc' },
                select: {
                  rank: true,
                  source: true,
                  score: true,
                  runId: true,
                  taxonomyVersion: true,
                  evidence: true,
                  movie: { select: { tmdbId: true } },
                },
              },
            },
          },
          nodeReleases: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              taxonomyVersion: true,
              runId: true,
              isPublished: true,
              publishedAt: true,
              createdAt: true,
              items: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!season || season.packs.length === 0) {
    throw new Error('Remote Season 1 horror pack not found');
  }
  const pack = season.packs[0]!;
  const published = pack.nodeReleases.find((release) => release.isPublished) ?? null;

  const payload: BackupPayload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    remoteUrlRedacted: redactDatabaseUrl(remoteUrl),
    seasonSlug: 'season-1',
    packSlug: 'horror',
    currentPublishedReleaseId: published?.id ?? null,
    currentPublishedRunId: published?.runId ?? null,
    currentPublishedTaxonomyVersion: published?.taxonomyVersion ?? null,
    journeyNodes: pack.nodes.map((node) => ({
      slug: node.slug,
      name: node.name,
      orderIndex: node.orderIndex,
      taxonomyVersion: node.taxonomyVersion,
    })),
    nodeMovies: pack.nodes.flatMap((node) => node.movies.map((assignment) => ({
      nodeSlug: node.slug,
      movieTmdbId: assignment.movie.tmdbId,
      rank: assignment.rank,
      source: assignment.source,
      score: assignment.score,
      runId: assignment.runId,
      taxonomyVersion: assignment.taxonomyVersion,
      evidence: assignment.evidence,
    }))),
    releases: pack.nodeReleases.map((release) => ({
      id: release.id,
      taxonomyVersion: release.taxonomyVersion,
      runId: release.runId,
      isPublished: release.isPublished,
      publishedAt: release.publishedAt ? release.publishedAt.toISOString() : null,
      createdAt: release.createdAt.toISOString(),
      itemCount: release.items.length,
    })),
  };

  const backupPath = resolve(outputPath ?? `artifacts/backups/season1-remote-catalog-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return backupPath;
}

async function rollbackPublish(remote: PrismaClient, releaseId: string): Promise<void> {
  const release = await remote.seasonNodeRelease.findUnique({
    where: { id: releaseId },
    select: { id: true, season: { select: { slug: true } }, pack: { select: { slug: true, id: true } } },
  });
  if (!release || release.season.slug !== 'season-1' || release.pack.slug !== 'horror') {
    throw new Error(`Release ${releaseId} is not a Season 1 horror release`);
  }
  await remote.$transaction(async (tx) => {
    await tx.seasonNodeRelease.updateMany({
      where: { packId: release.pack.id, isPublished: true },
      data: { isPublished: false, publishedAt: null },
    });
    await tx.seasonNodeRelease.update({
      where: { id: release.id },
      data: { isPublished: true, publishedAt: new Date() },
    });
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  requiredFlag(argv, '--publishRemote');
  requiredFlag(argv, '--iUnderstandThisWritesRemote');

  const remoteUrl = parseOption(argv, '--remoteUrl') ?? process.env.REMOTE_DATABASE_URL ?? null;
  if (!remoteUrl) {
    throw new Error('Missing remote database url. Provide --remoteUrl=<postgres-url> or REMOTE_DATABASE_URL');
  }
  const rollbackToReleaseId = parseOption(argv, '--rollbackToReleaseId');
  const backupOutput = parseOption(argv, '--backupOutput');

  const stamp = await readVerificationStamp().catch(() => null);
  if (!stamp) {
    throw new Error(`Missing verification stamp at ${VERIFICATION_STAMP_PATH}. Run npm run local:verify-catalog first.`);
  }
  if (stamp.checks.some((check) => !check.pass)) {
    throw new Error('Verification stamp contains failed checks. Resolve locally before remote publish.');
  }

  const local = new PrismaClient();
  const remote = new PrismaClient({ datasources: { db: { url: remoteUrl } } });
  let backupPath = '';

  try {
    backupPath = await backupRemoteState(remote, remoteUrl, backupOutput);
    console.log(`[remote.publish-catalog] remote backup written: ${backupPath}`);

    if (rollbackToReleaseId) {
      await rollbackPublish(remote, rollbackToReleaseId);
      console.log(`[remote.publish-catalog] rollback publish complete: release=${rollbackToReleaseId}`);
      return;
    }

    const { season: localSeason, pack: localPack, release: localRelease } = await resolveLocalPublished(local);
    if (localRelease.taxonomyVersion !== stamp.taxonomyVersion || localRelease.runId !== stamp.runId) {
      throw new Error(`Verification stamp mismatch. stamp=${stamp.taxonomyVersion}/${stamp.runId} localPublished=${localRelease.taxonomyVersion}/${localRelease.runId}`);
    }

    const remoteSeason = await remote.season.findUnique({
      where: { slug: 'season-1' },
      select: { id: true, packs: { where: { slug: 'horror' }, select: { id: true } } },
    });
    if (!remoteSeason || remoteSeason.packs.length === 0) {
      throw new Error('Remote Season 1 horror pack not found');
    }
    const remotePackId = remoteSeason.packs[0]!.id;

    const tmdbIds = [...new Set(localRelease.items.map((item) => item.movie.tmdbId))];
    const remoteMovies = await remote.movie.findMany({
      where: { tmdbId: { in: tmdbIds } },
      select: { id: true, tmdbId: true },
    });
    const remoteMovieIdByTmdb = new Map(remoteMovies.map((movie) => [movie.tmdbId, movie.id] as const));
    const missingTmdbIds = tmdbIds.filter((tmdbId) => !remoteMovieIdByTmdb.has(tmdbId));
    if (missingTmdbIds.length > 0) {
      throw new Error(`Remote catalog missing ${missingTmdbIds.length} movies needed for published snapshot. First missing TMDB IDs: ${missingTmdbIds.slice(0, 20).join(', ')}`);
    }

    await remote.$transaction(async (tx) => {
      const nodeIdBySlug = new Map<string, string>();
      for (const localNode of localPack.nodes) {
        // eslint-disable-next-line no-await-in-loop
        const node = await tx.journeyNode.upsert({
          where: { packId_slug: { packId: remotePackId, slug: localNode.slug } },
          create: {
            packId: remotePackId,
            slug: localNode.slug,
            name: localNode.name,
            taxonomyVersion: localNode.taxonomyVersion,
            learningObjective: `${localNode.name} learning objective.`,
            whatToNotice: [],
            eraSubgenreFocus: 'Season 1',
            spoilerPolicyDefault: 'NO_SPOILERS',
            orderIndex: localNode.orderIndex,
          },
          update: {
            name: localNode.name,
            taxonomyVersion: localNode.taxonomyVersion,
            orderIndex: localNode.orderIndex,
          },
          select: { id: true, slug: true },
        });
        nodeIdBySlug.set(node.slug, node.id);
      }

      const nodeIds = [...nodeIdBySlug.values()];
      await tx.nodeMovie.deleteMany({
        where: {
          nodeId: { in: nodeIds },
        },
      });

      await tx.seasonNodeRelease.updateMany({
        where: { seasonId: remoteSeason.id, packId: remotePackId, isPublished: true },
        data: { isPublished: false, publishedAt: null },
      });

      const remoteRelease = await tx.seasonNodeRelease.upsert({
        where: {
          packId_taxonomyVersion_runId: {
            packId: remotePackId,
            taxonomyVersion: localRelease.taxonomyVersion,
            runId: localRelease.runId,
          },
        },
        create: {
          seasonId: remoteSeason.id,
          packId: remotePackId,
          taxonomyVersion: localRelease.taxonomyVersion,
          runId: localRelease.runId,
          isPublished: true,
          publishedAt: new Date(),
          metadata: {
            source: 'remote-publish-catalog',
            localSeasonId: localSeason.id,
            localPackId: localPack.id,
            localReleaseId: localRelease.id,
          },
        },
        update: {
          isPublished: true,
          publishedAt: new Date(),
          metadata: {
            source: 'remote-publish-catalog',
            localSeasonId: localSeason.id,
            localPackId: localPack.id,
            localReleaseId: localRelease.id,
          },
        },
        select: { id: true },
      });

      await tx.seasonNodeReleaseItem.deleteMany({ where: { releaseId: remoteRelease.id } });

      if (localRelease.items.length > 0) {
        await tx.seasonNodeReleaseItem.createMany({
          data: localRelease.items.map((item) => ({
            releaseId: remoteRelease.id,
            nodeSlug: item.nodeSlug,
            movieId: remoteMovieIdByTmdb.get(item.movie.tmdbId)!,
            rank: item.rank,
            source: item.source,
            score: item.score,
            evidence: item.evidence,
          })),
        });
        await tx.nodeMovie.createMany({
          data: localRelease.items.map((item) => ({
            nodeId: nodeIdBySlug.get(item.nodeSlug)!,
            movieId: remoteMovieIdByTmdb.get(item.movie.tmdbId)!,
            rank: item.rank,
            source: item.source,
            score: item.score,
            evidence: item.evidence,
            runId: localRelease.runId,
            taxonomyVersion: localRelease.taxonomyVersion,
          })),
          skipDuplicates: true,
        });
      }
    });

    console.log('[remote.publish-catalog] publish complete');
    console.log(`[remote.publish-catalog] taxonomyVersion=${stamp.taxonomyVersion} runId=${stamp.runId}`);
    console.log(`[remote.publish-catalog] rollback: npm run remote:publish-catalog -- --publishRemote --iUnderstandThisWritesRemote --remoteUrl=${redactDatabaseUrl(remoteUrl)} --rollbackToReleaseId=<releaseId-from-backup>`);
    console.log(`[remote.publish-catalog] backup file: ${backupPath}`);
  } finally {
    await Promise.all([local.$disconnect(), remote.$disconnect()]);
  }
}

main().catch((error) => {
  console.error('[remote.publish-catalog] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
