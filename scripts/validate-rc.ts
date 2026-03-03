import { execSync } from 'node:child_process';

function run(command: string): void {
  const databaseUrl =
    process.env.DATABASE_URL
    ?? process.env.DATABASE_URL_TEST
    ?? process.env.TEST_DATABASE_URL
    ?? 'postgresql://postgres:postgres@localhost:5432/postgres?schema=rc_validation_test';

  execSync(command, {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}

function main(): void {
  run('npx prisma validate');
  run('npm run prisma:generate');
  run('npm run reset:test-db');
  run('npm run lint');
  run('npm test -- tests/unit');
  run('npm test -- tests/api tests/prisma tests/acceptance');
  run('npm run test:e2e');
  if (process.env.SKIP_EXTERNAL_LINK_GATES !== 'true') {
    run('npm run check:external-links:gates');
  }
  console.log('RC validation passed.');
}

try {
  main();
} catch (error) {
  console.error('RC validation failed.');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
}
