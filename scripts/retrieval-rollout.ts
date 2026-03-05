import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyRetrievalRolloutEnv } from '../src/lib/evidence/retrieval/rollout-env';

type RolloutArgs = {
  mode: 'cache' | 'hybrid';
  requireIndex: boolean;
  envPath: string;
  dryRun: boolean;
};

function parseArgs(): RolloutArgs {
  const args = process.argv.slice(2);
  const modeRaw = args[args.findIndex((arg) => arg === '--mode') + 1];
  const requireIndexRaw = args[args.findIndex((arg) => arg === '--requireIndex') + 1];
  const envPathRaw = args[args.findIndex((arg) => arg === '--env') + 1];
  const dryRun = args.includes('--dryRun');

  const mode = modeRaw === 'hybrid' ? 'hybrid' : modeRaw === 'cache' ? 'cache' : null;
  if (!mode) {
    throw new Error('Missing or invalid --mode <cache|hybrid>');
  }
  if (requireIndexRaw !== 'true' && requireIndexRaw !== 'false') {
    throw new Error('Missing or invalid --requireIndex <true|false>');
  }

  return {
    mode,
    requireIndex: requireIndexRaw === 'true',
    envPath: resolve(process.cwd(), envPathRaw ?? '.env.production'),
    dryRun,
  };
}

function run(): void {
  const args = parseArgs();
  const current = existsSync(args.envPath) ? readFileSync(args.envPath, 'utf8') : '';
  const next = applyRetrievalRolloutEnv(current, {
    mode: args.mode,
    requireIndex: args.requireIndex,
  });

  if (!args.dryRun) {
    writeFileSync(args.envPath, next, 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    envPath: args.envPath,
    mode: args.mode,
    requireIndex: args.requireIndex,
    dryRun: args.dryRun,
    changed: current !== next,
  }, null, 2));
}

try {
  run();
} catch (error) {
  console.error('[retrieval-rollout] failed', error);
  process.exitCode = 1;
}
