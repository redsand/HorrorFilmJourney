import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateJourneyWorthinessSelectionGate,
  journeyWorthinessDiagnosticPass,
  journeyWorthinessSelectionGatePass,
  type JourneyWorthinessMovieInput,
} from '@/lib/journey/journey-worthiness';

type Fixture = {
  high_quality: JourneyWorthinessMovieInput;
  low_quality: JourneyWorthinessMovieInput;
};

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'journey-worthiness-movies.json'), 'utf8'),
) as Fixture;

describe('journey worthiness predicate alignment', () => {
  it('keeps diagnostic and selection predicates in sync', () => {
    const inputs: JourneyWorthinessMovieInput[] = [
      fixture.high_quality,
      fixture.low_quality,
      {
        ...fixture.high_quality,
        voteCount: 3200,
        popularity: 18,
        receptionSources: [],
      },
      {
        ...fixture.low_quality,
        year: 1998,
        runtimeMinutes: 95,
        posterUrl: '/poster.jpg',
      },
    ];

    for (const movie of inputs) {
      const diagnostic = journeyWorthinessDiagnosticPass(movie, 'season-1', { nowYear: 2026 });
      const selection = journeyWorthinessSelectionGatePass(movie, 'season-1', { nowYear: 2026 });
      const evaluated = evaluateJourneyWorthinessSelectionGate(movie, 'season-1', { nowYear: 2026 });
      expect(diagnostic).toBe(selection);
      expect(selection).toBe(evaluated.pass);
    }
  });
});
