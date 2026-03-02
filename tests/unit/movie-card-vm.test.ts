import { describe, expect, it } from 'vitest';
import { zMovieCardVM } from '@/contracts/movieCardVM';

function buildValidMovieCardVM() {
  return {
    movie: {
      tmdbId: 550,
      title: 'Fight Club',
      year: 1999,
      posterUrl: 'https://image.tmdb.org/t/p/original/example.jpg',
    },
    ratings: {
      imdb: {
        value: 8.8,
        scale: '10' as const,
        rawValue: '8.8/10',
      },
      additional: [{ source: 'Rotten Tomatoes', value: 79, scale: '100' as const }],
    },
    reception: {
      critics: { source: 'Metacritic', value: 66, scale: '100' as const },
      audience: { source: 'RT Audience', value: 96, scale: '100' as const },
      summary: 'A divisive release that became a cult classic.',
    },
    credits: {
      director: 'David Fincher',
      castHighlights: [
        { name: 'Edward Norton', role: 'The Narrator' },
        { name: 'Brad Pitt', role: 'Tyler Durden' },
      ],
    },
    streaming: {
      region: 'US',
      offers: [],
    },
    codex: {
      whyImportant: 'Defines late-90s anti-consumerist zeitgeist horror-adjacent anxiety.',
      whatItTeaches: 'How subversive narration can reshape audience trust.',
      watchFor: ['Unreliable POV', 'Industrial production design', 'Satirical tone shifts'],
      historicalContext: 'Part of a wave of transgressive studio films at the turn of the millennium.',
      spoilerPolicy: 'LIGHT' as const,
      journeyNode: 'identity-horror-precursors',
      nextStepHint: 'Pair with a body-horror identity text from the same era.',
    },
    evidence: [],
  };
}

describe('movie card view model contract', () => {
  it('rejects missing posterUrl', () => {
    const payload = buildValidMovieCardVM();
    // @ts-expect-error intentional test mutation
    delete payload.movie.posterUrl;

    expect(zMovieCardVM.safeParse(payload).success).toBe(false);
  });

  it('rejects missing imdb rating', () => {
    const payload = buildValidMovieCardVM();
    // @ts-expect-error intentional test mutation
    delete payload.ratings.imdb;

    expect(zMovieCardVM.safeParse(payload).success).toBe(false);
  });

  it('rejects additional ratings length < 1', () => {
    const payload = buildValidMovieCardVM();
    payload.ratings.additional = [];

    expect(zMovieCardVM.safeParse(payload).success).toBe(false);
  });

  it('rejects watchFor length != 3', () => {
    const payload = buildValidMovieCardVM();
    // @ts-expect-error intentional test mutation
    payload.codex.watchFor = ['only one'];

    expect(zMovieCardVM.safeParse(payload).success).toBe(false);
  });

  it('requires streaming.offers to exist (empty ok)', () => {
    const validPayload = buildValidMovieCardVM();
    expect(zMovieCardVM.safeParse(validPayload).success).toBe(true);

    const invalidPayload = buildValidMovieCardVM();
    // @ts-expect-error intentional test mutation
    delete invalidPayload.streaming.offers;
    expect(zMovieCardVM.safeParse(invalidPayload).success).toBe(false);
  });

  it('requires evidence to exist (empty ok)', () => {
    const validPayload = buildValidMovieCardVM();
    expect(zMovieCardVM.safeParse(validPayload).success).toBe(true);

    const invalidPayload = buildValidMovieCardVM();
    // @ts-expect-error intentional test mutation
    delete invalidPayload.evidence;
    expect(zMovieCardVM.safeParse(invalidPayload).success).toBe(false);
  });
});
