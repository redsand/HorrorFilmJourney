import { describe, expect, it } from 'vitest';
import { applyRetrievalRolloutEnv } from '@/lib/evidence/retrieval/rollout-env';

describe('retrieval rollout env', () => {
  it('updates existing retrieval keys', () => {
    const result = applyRetrievalRolloutEnv(
      [
        'NODE_ENV=production',
        'EVIDENCE_RETRIEVAL_MODE=cache',
        'EVIDENCE_RETRIEVAL_REQUIRE_INDEX=false',
      ].join('\n'),
      { mode: 'hybrid', requireIndex: true },
    );

    expect(result).toContain('EVIDENCE_RETRIEVAL_MODE=hybrid');
    expect(result).toContain('EVIDENCE_RETRIEVAL_REQUIRE_INDEX=true');
    expect(result).toContain('NODE_ENV=production');
  });

  it('appends missing retrieval keys', () => {
    const result = applyRetrievalRolloutEnv(
      'NODE_ENV=production\n',
      { mode: 'cache', requireIndex: false },
    );

    expect(result).toContain('NODE_ENV=production');
    expect(result).toContain('EVIDENCE_RETRIEVAL_MODE=cache');
    expect(result).toContain('EVIDENCE_RETRIEVAL_REQUIRE_INDEX=false');
  });
});
