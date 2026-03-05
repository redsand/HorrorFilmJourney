import { PrismaClient } from '@prisma/client';
import { seedStarterHorrorCatalog } from '../src/lib/testing/catalog-seed';
import { isLikelyLocalPostgresUrl } from './catalog-release-utils';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST;
  if (!isLikelyLocalPostgresUrl(databaseUrl)) {
    throw new Error('seed:catalog is local-only. Use remote:publish-catalog for remote writes.');
  }
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();

  try {
    const summary = await seedStarterHorrorCatalog(prisma);
    console.log(
      `Seed complete: movies=${summary.movieCount} ratings=${summary.ratingCount} evidence=${summary.evidenceCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
