import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeJourneyWorthiness,
  evaluateJourneyWorthinessTierGate,
  type JourneyWorthinessMovieInput,
} from '@/lib/journey/journeyWorthiness';

type Fixture = {
  high_quality: JourneyWorthinessMovieInput;
  low_quality: JourneyWorthinessMovieInput;
};

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'journey-worthiness-movies.json'), 'utf8'),
) as Fixture;

describe('journey worthiness', () => {
  it('scores fixture movies deterministically', () => {
    const first = computeJourneyWorthiness(fixture.high_quality, 'season-1', { nowYear: 2026 });
    const second = computeJourneyWorthiness(fixture.high_quality, 'season-1', { nowYear: 2026 });
    const low = computeJourneyWorthiness(fixture.low_quality, 'season-1', { nowYear: 2026 });

    expect(second).toEqual(first);
    expect(first.score).toBeCloseTo(0.863598, 6);
    expect(low.score).toBeCloseTo(0.116139, 6);
    expect(low.reasons).toEqual(expect.arrayContaining([
      'low_vote_count',
      'missing_metadata',
      'runtime_outlier',
      'low_rating',
    ]));
    expect(first.evidence).toEqual(expect.objectContaining({
      normalizedRating: expect.any(Number),
      voteConfidence: expect.any(Number),
      popularity: expect.any(Number),
      metadataCompleteness: expect.any(Number),
      directorSignal: expect.any(Number),
    }));
  });

  it('applies per-season config overrides', () => {
    const candidate: JourneyWorthinessMovieInput = {
      ...fixture.high_quality,
      voteCount: 3000,
    };

    const season1 = computeJourneyWorthiness(candidate, 'season-1', { nowYear: 2026 });
    const defaultSeason = computeJourneyWorthiness(candidate, 'season-999', { nowYear: 2026 });

    expect(season1.reasons).toContain('low_vote_count');
    expect(defaultSeason.reasons).not.toContain('low_vote_count');
    expect(defaultSeason.score).toBeCloseTo(season1.score, 6);
  });

  it('uses canonical runtime/tmdb vote fields when provided', () => {
    const candidate: JourneyWorthinessMovieInput = {
      ...fixture.high_quality,
      runtime: 98,
      runtimeMinutes: 10,
      tmdbVoteCount: 9000,
      voteCount: 10,
      tmdbVoteAverage: 7.6,
      ratings: [{ source: 'TMDB', value: 2.1, scale: '10' }],
    };

    const result = computeJourneyWorthiness(candidate, 'season-1', { nowYear: 2026 });
    expect(result.reasons).not.toContain('runtime_outlier');
    expect(result.reasons).not.toContain('low_vote_count');
    expect(result.evidence.normalizedRating).toBeCloseTo(0.76, 6);
  });

  it('classic with votes passes core journey gate', () => {
    const gate = evaluateJourneyWorthinessTierGate(fixture.high_quality, 'season-1', 'core', { nowYear: 2026 });
    expect(gate.pass).toBe(true);
    expect(gate.hardFailures).toEqual([]);
  });

  it('unrated but complete metadata can pass extended and fail core', () => {
    const unrated: JourneyWorthinessMovieInput = {
      ...fixture.high_quality,
      tmdbVoteCount: 0,
      voteCount: 0,
    };
    const extended = evaluateJourneyWorthinessTierGate(unrated, 'season-1', 'extended', { nowYear: 2026 });
    const core = evaluateJourneyWorthinessTierGate(unrated, 'season-1', 'core', { nowYear: 2026 });

    expect(extended.pass).toBe(true);
    expect(extended.result.voteCountState).toBe('zero');
    expect(core.pass).toBe(false);
    expect(core.hardFailures).toContain('vote_count_required_for_core');
  });

  it('missing vote count remains hard failure', () => {
    const missingVotes: JourneyWorthinessMovieInput = {
      ...fixture.high_quality,
      tmdbVoteCount: null,
      voteCount: null,
      ratings: fixture.high_quality.ratings?.filter((row) => row.source !== 'TMDB_VOTE_COUNT') ?? [],
    };
    const extended = evaluateJourneyWorthinessTierGate(missingVotes, 'season-1', 'extended', { nowYear: 2026 });
    const core = evaluateJourneyWorthinessTierGate(missingVotes, 'season-1', 'core', { nowYear: 2026 });

    expect(extended.pass).toBe(false);
    expect(core.pass).toBe(false);
    expect(extended.hardFailures).toContain('missing_vote_count');
    expect(core.hardFailures).toContain('missing_vote_count');
  });
});
