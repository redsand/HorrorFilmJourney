import { describe, expect, it } from 'vitest';
import { findUncheckedChecklistItems } from '@/lib/evidence/retrieval/tracker-checklist';

describe('tracker checklist parser', () => {
  it('ignores legend checkbox lines', () => {
    const markdown = [
      'Legend:',
      '- [ ] not started',
      '- [~] in progress',
      '- [x] done',
    ].join('\n');

    expect(findUncheckedChecklistItems(markdown)).toEqual([]);
  });

  it('returns actionable unchecked items with line numbers', () => {
    const markdown = [
      '### Phase X',
      '- [x] done item',
      '- [ ] actionable pending item',
      '- [~] in progress item',
    ].join('\n');

    expect(findUncheckedChecklistItems(markdown)).toEqual([
      {
        lineNumber: 3,
        text: '- [ ] actionable pending item',
      },
    ]);
  });
});
