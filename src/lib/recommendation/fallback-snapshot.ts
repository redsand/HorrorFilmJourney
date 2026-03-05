import type { PrismaClient } from '@prisma/client';
import { getReleaseContracts, type ReleaseContract } from '@/lib/nodes/governance/release-contract';

export type FallbackSnapshot = {
  seasonSlug: string;
  packSlug: string;
  tmdbIds: number[];
};

export async function computeFallbackSnapshot(prisma: PrismaClient, contract: ReleaseContract): Promise<FallbackSnapshot> {
  const pack = await prisma.genrePack.findUnique({
    where: { slug: contract.packSlug },
    select: {
      id: true,
      seasonId: true,
    },
  });
  if (!pack) {
    throw new Error(`Pack ${contract.packSlug} not found`);
  }

  const assignments = await prisma.nodeMovie.findMany({
    where: {
      node: { packId: pack.id },
      taxonomyVersion: contract.taxonomyVersion,
      tier: 'CORE',
    },
    orderBy: [{ node: { orderIndex: 'asc' } }, { coreRank: 'asc' }, { rank: 'asc' }],
    include: { movie: { select: { tmdbId: true } } },
  });

  return {
    seasonSlug: contract.seasonSlug,
    packSlug: contract.packSlug,
    tmdbIds: assignments.map((assignment) => assignment.movie.tmdbId),
  };
}

export function getFallbackContracts(): ReleaseContract[] {
  return getReleaseContracts();
}
