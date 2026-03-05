import { describe, expect, it } from 'vitest';
import {
  buildRcValidationCommandPlan,
  resolveRcValidationOptions,
} from '../../scripts/validate-rc-plan';

describe('validate rc plan', () => {
  it('includes retrieval and external link gates by default', () => {
    const options = resolveRcValidationOptions({});
    const plan = buildRcValidationCommandPlan(options);

    expect(plan).toContain('npm run check:retrieval:gates');
    expect(plan).toContain('npm run check:retrieval:tracker');
    expect(plan).toContain('npm run check:external-links:gates');
  });

  it('allows skipping retrieval gates via env flag', () => {
    const options = resolveRcValidationOptions({
      SKIP_RETRIEVAL_GATES: 'true',
    });
    const plan = buildRcValidationCommandPlan(options);

    expect(plan).not.toContain('npm run check:retrieval:gates');
    expect(plan).toContain('npm run check:retrieval:tracker');
    expect(plan).toContain('npm run check:external-links:gates');
  });

  it('allows skipping external link gates via env flag', () => {
    const options = resolveRcValidationOptions({
      SKIP_EXTERNAL_LINK_GATES: 'true',
    });
    const plan = buildRcValidationCommandPlan(options);

    expect(plan).toContain('npm run check:retrieval:gates');
    expect(plan).toContain('npm run check:retrieval:tracker');
    expect(plan).not.toContain('npm run check:external-links:gates');
  });

  it('allows skipping retrieval tracker gate via env flag', () => {
    const options = resolveRcValidationOptions({
      SKIP_RETRIEVAL_TRACKER_GATE: 'true',
    });
    const plan = buildRcValidationCommandPlan(options);

    expect(plan).toContain('npm run check:retrieval:gates');
    expect(plan).not.toContain('npm run check:retrieval:tracker');
  });
});
