export type RcValidationOptions = {
  skipExternalLinkGates: boolean;
  skipRetrievalGates: boolean;
  skipRetrievalTrackerGate: boolean;
  skipRagCompletionReport: boolean;
};

export function resolveRcValidationOptions(env: NodeJS.ProcessEnv): RcValidationOptions {
  return {
    skipExternalLinkGates: env.SKIP_EXTERNAL_LINK_GATES === 'true',
    skipRetrievalGates: env.SKIP_RETRIEVAL_GATES === 'true',
    skipRetrievalTrackerGate: env.SKIP_RETRIEVAL_TRACKER_GATE === 'true',
    skipRagCompletionReport: env.SKIP_RAG_COMPLETION_REPORT === 'true',
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

  if (!options.skipRagCompletionReport) {
    commands.push('npm run bootstrap:rag:value -- --runs 25');
  }

  if (!options.skipRetrievalGates) {
    commands.push('npm run check:retrieval:gates');
  }
  if (!options.skipRetrievalTrackerGate) {
    commands.push('npm run check:retrieval:tracker');
  }
  if (!options.skipExternalLinkGates) {
    commands.push('npm run check:external-links:gates');
  }
  if (!options.skipRagCompletionReport) {
    commands.push('npm run report:rag:completion -- --enforce');
  }

  return commands;
}
