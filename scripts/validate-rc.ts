import { execSync } from 'node:child_process';
import { buildRcValidationCommandPlan, resolveRcValidationOptions } from './validate-rc-plan.ts';

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
  const options = resolveRcValidationOptions(process.env);
  const plan = buildRcValidationCommandPlan(options);
  for (const command of plan) {
    run(command);
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
