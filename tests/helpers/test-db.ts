import { execSync } from 'node:child_process';

const DEFAULT_TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';

function sanitizeSchema(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

export function buildTestDatabaseUrl(schemaName: string): string {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_TEST_DB_URL;
  const url = new URL(base);
  url.searchParams.set('schema', sanitizeSchema(schemaName));
  return url.toString();
}

export function prismaDbPush(databaseUrl: string): void {
  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
