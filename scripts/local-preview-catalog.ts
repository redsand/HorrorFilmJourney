import { PrismaClient } from '@prisma/client';
import { ensureLocalDatabaseOrThrow } from './catalog-release-utils.ts';

async function main(): Promise<void> {
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    const pack = await prisma.genrePack.findUnique({
      where: { slug: 'horror' },
      select: {
        id: true,
        season: { select: { slug: true } },
        nodeReleases: {
          where: { isPublished: true },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: {
            id: true,
            taxonomyVersion: true,
            runId: true,
            items: { select: { id: true } },
          },
        },
      },
    });
    if (!pack || pack.season.slug !== 'season-1') {
      throw new Error('Season 1 horror pack not found');
    }
    const published = pack.nodeReleases[0];
    if (!published) {
      throw new Error('No published Season 1 snapshot found. Run local:build-catalog first.');
    }

    console.log('[local.preview-catalog] Season 1 snapshot summary');
    console.log(`- releaseId: ${published.id}`);
    console.log(`- taxonomyVersion: ${published.taxonomyVersion}`);
    console.log(`- runId: ${published.runId}`);
    console.log(`- assignments: ${published.items.length}`);
    console.log('');
    console.log('Preview URLs (run `npm run dev` first):');
    console.log('- Journey: http://localhost:3000/journey');
    console.log('- Companion sample: http://localhost:3000/companion/550?spoilerPolicy=NO_SPOILERS');
    console.log('- Admin curriculum: http://localhost:3000/admin/curriculum');
    console.log('- Node monitor API: http://localhost:3000/api/admin/season1/node-monitor');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[local.preview-catalog] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
