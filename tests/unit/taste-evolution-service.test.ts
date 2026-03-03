import { describe, expect, it } from 'vitest';
import { summarizeTasteEvolution } from '@/lib/taste/taste-evolution-service';

describe('Taste evolution summary', () => {
  it('describes shift toward psychological themes over interaction span', () => {
    const summary = summarizeTasteEvolution({
      snapshots: [
        {
          takenAt: new Date('2026-03-01T00:00:00.000Z'),
          intensityPreference: 0.4,
          pacingPreference: 0.6,
          psychologicalVsSupernatural: 0.35,
          goreTolerance: 0.4,
          ambiguityTolerance: 0.45,
          nostalgiaBias: 0.5,
          auteurAffinity: 0.5,
        },
        {
          takenAt: new Date('2026-03-10T00:00:00.000Z'),
          intensityPreference: 0.42,
          pacingPreference: 0.55,
          psychologicalVsSupernatural: 0.72,
          goreTolerance: 0.38,
          ambiguityTolerance: 0.52,
          nostalgiaBias: 0.5,
          auteurAffinity: 0.54,
        },
      ],
      interactionSpan: 6,
    });

    expect(summary).toContain('shifted toward psychological themes over 6 films');
  });
});
