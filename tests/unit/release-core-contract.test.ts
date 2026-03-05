import { beforeAll, beforeEach, describe, expect, it, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { createSeasonNodeReleaseFromNodeMovie, publishSeasonNodeRelease } from '@/lib/nodes/governance/release-artifact';
import { getReleaseContract } from '@/lib/nodes/governance/release-contract';

const testDbUrl = buildTestDatabaseUrl('release_core_contract_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
const contract = getReleaseContract({ seasonSlug: 'season-1', packSlug: 'horror' });

async function cleanDatabase(): Promise<void> {
  await prisma.seasonNodeReleaseItem.deleteMany();
  await prisma.seasonNodeRelease.deleteMany();
  await prisma.nodeMovie.deleteMany();
  await prisma.journeyNode.deleteMany();
  await prisma.genrePack.deleteMany();
  await prisma.season.deleteMany();
  await prisma.movie.deleteMany();
}

async function createSeason(): Promise<{ seasonId: string; packId: string }> {
  const season = await prisma.season.create({ data: { slug: 'season-1', name: 'Season 1' } });
  const pack = await prisma.genrePack.create({
    data: {
      slug: 'horror',
      name: 'Horror',
      seasonId: season.id,
      primaryGenre: 'horror',
      isEnabled: true,
    },
  });
  return { seasonId: season.id, packId: pack.id };
}

async function createNode(packId: string, slug: string, orderIndex: number) {
  return prisma.journeyNode.create({
    data: {
      packId,
      slug,
      name: slug,
      learningObjective: 'Test objective',
      whatToNotice: { note: 'notice' },
      eraSubgenreFocus: 'arc',
      spoilerPolicyDefault: 'none',
      taxonomyVersion: contract.taxonomyVersion,
      orderIndex,
    },
  });
}

async function createMovie(tmdbId: number, title: string) {
  return prisma.movie.create({
    data: {
      tmdbId,
      title,
      year: 2000,
      posterUrl: 'https://example.com/poster.jpg',
    },
  });
}

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('release core contract guard', () => {
  it('fails to publish when release contains an EXTENDED assignment', async () => {
    const { seasonId, packId } = await createSeason();
    const node = await createNode(packId, 'extended-node', 1);
    const movie = await createMovie(101, 'Extended candidate');
    await prisma.nodeMovie.create({
      data: {
        nodeId: node.id,
        movieId: movie.id,
        rank: 1,
        tier: 'EXTENDED',
        taxonomyVersion: contract.taxonomyVersion,
        source: 'test',
      },
    });

    const release = await prisma.seasonNodeRelease.create({
      data: {
        seasonId,
        packId,
        taxonomyVersion: contract.taxonomyVersion,
        runId: 'extended-guard',
      },
    });
    await prisma.seasonNodeReleaseItem.create({
      data: {
        releaseId: release.id,
        nodeSlug: node.slug,
        movieId: movie.id,
        rank: 1,
        source: 'extended-guard',
      },
    });

    await expect(publishSeasonNodeRelease(prisma, { seasonSlug: 'season-1', packSlug: 'horror' })).rejects.toThrow(
      '[release contract]',
    );
  });

  it('publishes the exact NodeMovie core set (order + membership)', async () => {
    const { seasonId, packId } = await createSeason();
    const nodeA = await createNode(packId, 'node-a', 1);
    const nodeB = await createNode(packId, 'node-b', 2);
    const movieA = await createMovie(201, 'Core A');
    const movieB = await createMovie(202, 'Core B');
    const movieC = await createMovie(203, 'Core C');

    await prisma.nodeMovie.create({
      data: {
        nodeId: nodeA.id,
        movieId: movieA.id,
        rank: 1,
        coreRank: 1,
        tier: 'CORE',
        taxonomyVersion: contract.taxonomyVersion,
      },
    });
    await prisma.nodeMovie.create({
      data: {
        nodeId: nodeB.id,
        movieId: movieB.id,
        rank: 1,
        coreRank: 1,
        tier: 'CORE',
        taxonomyVersion: contract.taxonomyVersion,
      },
    });
    await prisma.nodeMovie.create({
      data: {
        nodeId: nodeB.id,
        movieId: movieC.id,
        rank: 2,
        coreRank: 2,
        tier: 'CORE',
        taxonomyVersion: contract.taxonomyVersion,
      },
    });

    const release = await createSeasonNodeReleaseFromNodeMovie(prisma, {
      seasonId,
      packId,
      taxonomyVersion: contract.taxonomyVersion,
      runId: 'repair-core-test',
      publish: false,
    });

    await publishSeasonNodeRelease(prisma, { seasonSlug: 'season-1', packSlug: 'horror' });

    const releaseItems = await prisma.seasonNodeReleaseItem.findMany({
      where: { releaseId: release.releaseId },
      orderBy: [{ rank: 'asc' }, { nodeSlug: 'asc' }],
      select: { nodeSlug: true, movieId: true, rank: true },
    });
    const nodeMovies = await prisma.nodeMovie.findMany({
      where: {
        node: { packId },
        taxonomyVersion: contract.taxonomyVersion,
        tier: 'CORE',
      },
      include: { node: { select: { slug: true } } },
      orderBy: [{ node: { orderIndex: 'asc' } }, { coreRank: 'asc' }, { rank: 'asc' }],
    });

    expect(releaseItems.length).toBe(nodeMovies.length);
    const releaseSignature = releaseItems.map((item) => `${item.nodeSlug}:${item.movieId}:${item.rank}`);
    const nodeSignature = nodeMovies.map((entry) => `${entry.node.slug}:${entry.movieId}:${entry.rank}`);
    expect(releaseSignature).toEqual(nodeSignature);
  });
});
