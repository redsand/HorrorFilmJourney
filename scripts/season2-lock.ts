import { execSync } from 'node:child_process';

function run(command: string): void {
  console.log(`[season2.lock] ${command}`);
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
  });
}

function main(): void {
  const apply = process.argv.includes('--apply');

  run('npm run curate:season2');
  run('npm run seed:season2:cult');
  run('npm run publish:season2');
  run('npm run export:season2:canonical');

  if (apply) {
    run('npm run publish:season2 -- --apply');
    run('npm run export:season2:canonical');
  }

  console.log(
    `[season2.lock] complete (apply=${apply ? 'true' : 'false'}).`,
  );
}

try {
  main();
} catch (error) {
  console.error('[season2.lock] failed');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
}

