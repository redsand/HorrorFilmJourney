export type RcValidationOptions = {
  skipExternalLinkGates: boolean;
  skipRetrievalGates: boolean;
};

export function resolveRcValidationOptions(env: NodeJS.ProcessEnv): RcValidationOptions {
  return {
    skipExternalLinkGates: env.SKIP_EXTERNAL_LINK_GATES === 'true',
    skipRetrievalGates: env.SKIP_RETRIEVAL_GATES === 'true',
  };
}

export function buildRcValidationCommandPlan(options: RcValidationOptions): string[] {
  const commands = [
    'npx prisma validate',
    'npm run prisma:generate',
    'npm run reset:test-db',
    'npm run lint',
    'npm test -- tests/unit',
    'npm test -- tests/api tests/prisma tests/acceptance',
    'npm run test:e2e',
  ];

  if (!options.skipRetrievalGates) {
    commands.push('npm run check:retrieval:gates');
  }
  if (!options.skipExternalLinkGates) {
    commands.push('npm run check:external-links:gates');
  }

  return commands;
}
