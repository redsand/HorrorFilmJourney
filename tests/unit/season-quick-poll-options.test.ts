import { describe, expect, it } from 'vitest';
import { getSeasonQuickPollOptions } from '@/lib/journey/season-quick-poll-options';

describe('season quick poll options', () => {
  it('returns horror-oriented emotions for season-1', () => {
    const options = getSeasonQuickPollOptions('season-1');
    expect(options.emotions).toContain('dread');
    expect(options.emotions).toContain('creepy');
    expect(options.emotions).not.toContain('campy');
  });

  it('returns cult-oriented emotions for season-2', () => {
    const options = getSeasonQuickPollOptions('season-2');
    expect(options.emotions).toContain('campy');
    expect(options.emotions).toContain('transgressive');
    expect(options.emotions).not.toContain('dread');
  });

  it('falls back to season-1 options when season is unknown', () => {
    const options = getSeasonQuickPollOptions('season-99');
    expect(options.emotions).toContain('dread');
    expect(options.emotions).not.toContain('campy');
  });
});

