import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

function sanitizeSchema(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL_TEST
    ?? process.env.TEST_DATABASE_URL
    ?? process.env.DATABASE_URL
    ?? 'postgresql://postgres:postgres@localhost:5432/postgres?schema=rc_validation_test';

  const parsed = new URL(raw);
  const schema = sanitizeSchema(parsed.searchParams.get('schema') ?? 'rc_validation_test');
  parsed.searchParams.set('schema', schema);
  return parsed.toString();
}

async function resetSchema(databaseUrl: string): Promise<void> {
  const parsed = new URL(databaseUrl);
  const schema = parsed.searchParams.get('schema');
  if (!schema) {
    throw new Error('Database URL must include a schema query param');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  await resetSchema(databaseUrl);

  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  execSync('node --experimental-strip-types scripts/seed-catalog.ts', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  console.log('Test DB reset and seed completed.');
}

main().catch((error) => {
  console.error('reset-test-db failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
