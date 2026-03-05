export type RetrievalRolloutEnvConfig = {
  mode: 'cache' | 'hybrid';
  requireIndex: boolean;
};

function upsertEnvLine(lines: string[], key: string, value: string): string[] {
  const out = [...lines];
  const prefix = `${key}=`;
  const index = out.findIndex((line) => line.startsWith(prefix));
  const next = `${key}=${value}`;
  if (index >= 0) {
    out[index] = next;
  } else {
    out.push(next);
  }
  return out;
}

export function applyRetrievalRolloutEnv(
  content: string,
  config: RetrievalRolloutEnvConfig,
): string {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  const withMode = upsertEnvLine(lines, 'EVIDENCE_RETRIEVAL_MODE', config.mode);
  const withRequireIndex = upsertEnvLine(
    withMode,
    'EVIDENCE_RETRIEVAL_REQUIRE_INDEX',
    config.requireIndex ? 'true' : 'false',
  );
  return `${withRequireIndex.join('\n').replace(/\n+$/g, '')}\n`;
}
