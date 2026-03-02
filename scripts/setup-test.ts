import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

function sanitizeSchema(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function resolveTestDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL_TEST
    ?? process.env.TEST_DATABASE_URL
    ?? process.env.DATABASE_URL
    ?? 'postgresql://postgres:postgres@localhost:5432/postgres?schema=rc_validation_test';

  const url = new URL(raw);
  const schema = sanitizeSchema(url.searchParams.get('schema') ?? 'rc_validation_test');
  url.searchParams.set('schema', schema);
  return url.toString();
}

async function resetSchema(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema');
  if (!schema) {
    throw new Error('Test database URL must include schema query parameter');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  } finally {
    await prisma.$disconnect();
  }
}

function run(command: string, databaseUrl: string): void {
  execSync(command, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function main(): Promise<void> {
  const databaseUrl = resolveTestDatabaseUrl();
  await resetSchema(databaseUrl);

  run('npx prisma migrate deploy', databaseUrl);
  run('node --experimental-strip-types scripts/bootstrap-admin.ts', databaseUrl);
  run('node --experimental-strip-types scripts/seed-catalog.ts', databaseUrl);

  console.log('setup:test completed');
}

main().catch((error) => {
  console.error('setup:test failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
