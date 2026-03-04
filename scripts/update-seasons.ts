import { execSync } from 'node:child_process';

function run(command: string): void {
  console.log(`>> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

function main(): void {
  run('npm run seed:season1:subgenres');
  run('npm run seed:season2:cult');

  if (process.env.PUBLISH_SEASON2_ON_UPDATE === 'true') {
    run('npm run publish:season2 -- --apply');
  } else {
    run('npm run publish:season2');
  }
}

main();

