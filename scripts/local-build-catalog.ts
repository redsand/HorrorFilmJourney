import { ensureLocalDatabaseOrThrow, parseFlag, runCommand } from './catalog-release-utils';

async function main(): Promise<void> {
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);

  const argv = process.argv.slice(2);
  const skipCatalog = parseFlag(argv, '--skipCatalog');
  const withClassifierAssist = parseFlag(argv, '--withClassifierAssist');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SEASON1_PUBLISH_SNAPSHOT: 'true',
  };
  if (withClassifierAssist) {
    env.SEASON1_CLASSIFIER_ASSIST_ENABLED = 'true';
  }

  console.log('[local.build-catalog] starting local Season 1 catalog build');
  if (!skipCatalog) {
    runCommand('npm run seed:catalog', env);
  }
  runCommand('npm run seed:season1:subgenres', env);
  console.log('[local.build-catalog] complete');
}

main().catch((error) => {
  console.error('[local.build-catalog] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
