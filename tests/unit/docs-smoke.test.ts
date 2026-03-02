import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const docsToCheck = [
  { path: 'docs/internal-testing.md', heading: '# Internal Testing Guide' },
  { path: 'docs/user-journey.md', heading: '# User Journey' },
  { path: 'docs/testing.md', heading: '# Testing Strategy' },
  { path: 'docs/design-spec.md', heading: '# Design Spec (Source of Truth)' },
];

const designRequirementHeadings = [
  '## R1',
  '## R2',
  '## R3',
  '## R4',
  '## R5',
  '## R6',
  '## R7',
  '## R8',
  '## R9',
  '## R10',
  '## R11',
  '## R12',
  '## R13',
  '## R14',
];

describe('docs smoke tests', () => {
  it('has required docs files with minimal headings', () => {
    docsToCheck.forEach(({ path, heading }) => {
      const content = readFileSync(path, 'utf-8');
      expect(content).toContain(heading);
    });
  });

  it('includes all numbered design requirements R1-R14', () => {
    const content = readFileSync('docs/design-spec.md', 'utf-8');
    designRequirementHeadings.forEach((heading) => {
      expect(content).toContain(heading);
    });
  });
});
