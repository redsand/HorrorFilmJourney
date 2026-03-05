import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/companion/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  movieFindUniqueMock,
  evidenceFindManyMock,
  externalReadingFindManyMock,
  resolveEffectivePackForUserMock,
  getPublishedNodesForMovieMock,
  userTasteProfileFindUniqueMock,
  movieStreamingCacheFindUniqueMock,
  companionCacheFindUniqueMock,
  companionCacheUpsertMock,
  companionCacheDeleteManyMock,
  recommendationItemFindFirstMock,
  getLlmProviderFromEnvMock,
  generateJsonMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  movieFindUniqueMock: vi.fn(),
  evidenceFindManyMock: vi.fn(),
  externalReadingFindManyMock: vi.fn(),
  resolveEffectivePackForUserMock: vi.fn(),
  getPublishedNodesForMovieMock: vi.fn(),
  userTasteProfileFindUniqueMock: vi.fn(),
  movieStreamingCacheFindUniqueMock: vi.fn(),
  companionCacheFindUniqueMock: vi.fn(),
  companionCacheUpsertMock: vi.fn(),
  companionCacheDeleteManyMock: vi.fn(),
  recommendationItemFindFirstMock: vi.fn(),
  getLlmProviderFromEnvMock: vi.fn(),
  generateJsonMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    movie: { findUnique: movieFindUniqueMock },
    userTasteProfile: { findUnique: userTasteProfileFindUniqueMock },
    evidencePacket: { findMany: evidenceFindManyMock },
    externalReadingCuration: { findMany: externalReadingFindManyMock },
    movieStreamingCache: { findUnique: movieStreamingCacheFindUniqueMock },
    companionCache: {
      findUnique: companionCacheFindUniqueMock,
      upsert: companionCacheUpsertMock,
      deleteMany: companionCacheDeleteManyMock,
    },
    recommendationItem: {
      findFirst: recommendationItemFindFirstMock,
    },
  },
}));

vi.mock('@/lib/packs/pack-resolver', () => ({
  resolveEffectivePackForUser: (...args: unknown[]) => resolveEffectivePackForUserMock(...args),
}));

vi.mock('@/lib/nodes/published-snapshot', () => ({
  getPublishedNodesForMovie: (...args: unknown[]) => getPublishedNodesForMovieMock(...args),
}));

vi.mock('@/ai', () => ({
  getLlmProviderFromEnv: (...args: unknown[]) => getLlmProviderFromEnvMock(...args),
}));

describe('GET /api/companion', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    movieFindUniqueMock.mockReset();
    evidenceFindManyMock.mockReset();
    externalReadingFindManyMock.mockReset();
    resolveEffectivePackForUserMock.mockReset();
    getPublishedNodesForMovieMock.mockReset();
    userTasteProfileFindUniqueMock.mockReset();
    movieStreamingCacheFindUniqueMock.mockReset();
    companionCacheFindUniqueMock.mockReset();
    companionCacheUpsertMock.mockReset();
    companionCacheDeleteManyMock.mockReset();
    recommendationItemFindFirstMock.mockReset();
    getLlmProviderFromEnvMock.mockReset();
    generateJsonMock.mockReset();
    companionCacheFindUniqueMock.mockResolvedValue(null);
    movieStreamingCacheFindUniqueMock.mockResolvedValue(null);
    userTasteProfileFindUniqueMock.mockResolvedValue(null);
    recommendationItemFindFirstMock.mockResolvedValue(null);
    resolveEffectivePackForUserMock.mockResolvedValue({
      packId: 'pack_horror',
      packSlug: 'horror',
      seasonSlug: 'season-1',
      primaryGenre: 'horror',
    });
    getPublishedNodesForMovieMock.mockResolvedValue([]);
    externalReadingFindManyMock.mockResolvedValue([]);
    companionCacheUpsertMock.mockResolvedValue(null);
    companionCacheDeleteManyMock.mockResolvedValue({ count: 0 });
    delete process.env.LLM_PROVIDER;
    delete process.env.USE_LLM;
    delete process.env.TMDB_API_KEY;
  });

  afterEach(() => {
    delete process.env.LLM_PROVIDER;
    delete process.env.USE_LLM;
    delete process.env.TMDB_API_KEY;
  });

  it('returns 400 when tmdbId is missing', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });

    const request = new Request('http://localhost/api/companion', {
      headers: {
        cookie: makeSessionCookie('user_1'),
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'tmdbId is required and must be an integer' },
    });
  });

  it('returns required companion keys with stable envelope', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
      director: 'John Carpenter',
      castTop: [{ name: 'Kurt Russell', role: 'R.J. MacReady' }],
    });
    evidenceFindManyMock.mockResolvedValueOnce([
      {
        sourceName: 'Source A',
        url: 'https://example.com/a',
        snippet: 'Snippet A',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS', {
      headers: {
        cookie: makeSessionCookie('user_1'),
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data.movie).toEqual({
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
    });
    expect(body.data.credits).toEqual({
      director: 'John Carpenter',
      cast: [{ name: 'Kurt Russell', role: 'R.J. MacReady' }],
    });
    expect(Array.isArray(body.data.sections.productionNotes)).toBe(true);
    expect(Array.isArray(body.data.sections.historicalNotes)).toBe(true);
    expect(Array.isArray(body.data.sections.receptionNotes)).toBe(true);
    expect(Array.isArray(body.data.sections.techniqueBreakdown)).toBe(true);
    expect(Array.isArray(body.data.sections.influenceMap)).toBe(true);
    expect(Array.isArray(body.data.sections.afterWatchingReflection)).toBe(true);
    expect(body.data.sections.afterWatchingReflection).toHaveLength(3);
    expect(Array.isArray(body.data.sections.trivia)).toBe(true);
    expect(body.data.sections.trivia).toHaveLength(5);
    expect(
      body.data.sections.productionNotes.some((line: string) => line.toLowerCase().includes('spoiler-safe')),
    ).toBe(true);
    expect(body.data.spoilerPolicy).toBe('NO_SPOILERS');
    expect(Array.isArray(body.data.evidence)).toBe(true);
    expect(body.data.evidence[0]?.provenance).toEqual(expect.objectContaining({
      retrievalMode: 'cache',
      sourceType: 'packet',
    }));
    expect(body.data.externalReadings).toEqual([]);
    expect(body.data.streaming).toEqual({ region: 'US', offers: [] });
  });

  it('includes externalReadings for a Season 1 film with a curated registry entry', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    resolveEffectivePackForUserMock.mockResolvedValueOnce({
      packId: 'pack_horror',
      packSlug: 'horror',
      seasonSlug: 'season-1',
      primaryGenre: 'horror',
    });
    movieFindUniqueMock.mockResolvedValueOnce({
      id: 'movie_17',
      tmdbId: 17,
      title: 'The Dark',
      year: 2005,
      posterUrl: 'https://img/17.jpg',
      director: 'John Fawcett',
      castTop: [{ name: 'Maria Bello', role: 'Adelle' }],
      ratings: [],
    });
    evidenceFindManyMock.mockResolvedValueOnce([]);

    const response = await GET(
      new Request('http://localhost/api/companion?tmdbId=17&spoilerPolicy=NO_SPOILERS', {
        headers: { cookie: makeSessionCookie('user_1') },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data.externalReadings)).toBe(true);
    expect(body.data.externalReadings.length).toBeGreaterThan(0);
    expect(body.data.externalReadings.some((entry: { url: string }) => entry.url.includes('bloody-disgusting.com'))).toBe(true);
  });

  it('returns no externalReadings for Season 2 when only Season 1 curated links exist', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    resolveEffectivePackForUserMock.mockResolvedValueOnce({
      packId: 'pack_cult',
      packSlug: 'cult-classics',
      seasonSlug: 'season-2',
      primaryGenre: 'cult',
    });
    movieFindUniqueMock.mockResolvedValueOnce({
      id: 'movie_17',
      tmdbId: 17,
      title: 'The Dark',
      year: 2005,
      posterUrl: 'https://img/17.jpg',
      director: 'John Fawcett',
      castTop: [{ name: 'Maria Bello', role: 'Adelle' }],
      ratings: [],
    });
    evidenceFindManyMock.mockResolvedValueOnce([]);

    const response = await GET(
      new Request('http://localhost/api/companion?tmdbId=17&spoilerPolicy=NO_SPOILERS', {
        headers: { cookie: makeSessionCookie('user_1') },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.externalReadings).toEqual([]);
  });

  it('rejects forceRefresh for non-admin users', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });

    const response = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS&forceRefresh=true', {
        headers: {
          cookie: makeSessionCookie('user_1', false),
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'FORBIDDEN', message: 'Admin access required for forced refresh' },
    });
  });

  it('allows forceRefresh for admin and clears cached companion rows', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    movieFindUniqueMock.mockResolvedValue({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
      director: null,
      castTop: null,
      ratings: [],
    });
    evidenceFindManyMock.mockResolvedValue([]);
    companionCacheFindUniqueMock.mockResolvedValue({
      payload: {
        movie: { tmdbId: 123, title: 'Cached Title', year: 1999, posterUrl: 'https://img/123.jpg' },
        credits: { director: 'Director A', cast: [{ name: 'Actor A' }] },
        sections: {
          productionNotes: ['p1'],
          historicalNotes: ['h1'],
          receptionNotes: ['r1'],
          techniqueBreakdown: ['t1'],
          influenceMap: ['i1'],
          afterWatchingReflection: ['r1', 'r2', 'r3'],
          trivia: ['t1', 't2', 't3', 't4', 't5'],
        },
        ratings: [],
        spoilerPolicy: 'NO_SPOILERS',
        evidence: [],
      },
      isFullyPopulated: true,
      expiresAt: new Date(Date.now() + 60_000),
      llmProvider: 'gemini',
      llmModel: 'gemini-2.5-flash',
    });

    const response = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS&forceRefresh=true', {
        headers: {
          cookie: makeSessionCookie('admin_1', true),
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(companionCacheDeleteManyMock).toHaveBeenCalledWith({ where: { movieId: 'movie_1' } });
    expect(body.data.movie.title).toBe('Companion Test');
  });

  it('changes content by spoilerPolicy', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValue({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
      director: null,
      castTop: null,
    });
    evidenceFindManyMock.mockResolvedValue([]);

    const noSpoilersResponse = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS', {
        headers: {
          cookie: makeSessionCookie('user_1'),
        },
      }),
    );

    const lightResponse = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=LIGHT', {
        headers: {
          cookie: makeSessionCookie('user_1'),
        },
      }),
    );

    const fullResponse = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=FULL', {
        headers: {
          cookie: makeSessionCookie('user_1'),
        },
      }),
    );

    const noSpoilers = await noSpoilersResponse.json();
    const light = await lightResponse.json();
    const full = await fullResponse.json();

    expect(noSpoilers.data.sections.productionNotes).not.toEqual(full.data.sections.productionNotes);
    expect(light.data.sections.productionNotes.some((line: string) => line.includes('Act I-II summary'))).toBe(true);
    expect(full.data.sections.productionNotes.some((line: string) => line.includes('includes ending'))).toBe(true);
    expect(full.data.sections.afterWatchingReflection).toHaveLength(3);
    expect(
      light.data.sections.afterWatchingReflection.some((line: string) =>
        line.toLowerCase().includes('predict')),
    ).toBe(true);
    expect(
      noSpoilers.data.sections.afterWatchingReflection.some((line: string) =>
        line.toLowerCase().includes('without spoilers')),
    ).toBe(true);
    expect(full.data.sections.trivia).toHaveLength(5);
    expect(
      noSpoilers.data.sections.receptionNotes.some((line: string) =>
        line.toLowerCase().includes('credits metadata is currently limited')),
    ).toBe(true);
  });

  it('returns cached fully populated companion payload when fresh', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
      director: null,
      castTop: null,
      ratings: [],
    });
    evidenceFindManyMock.mockResolvedValueOnce([]);
    companionCacheFindUniqueMock.mockResolvedValueOnce({
      payload: {
        movie: { tmdbId: 123, title: 'Cached Title', year: 1999, posterUrl: 'https://img/123.jpg' },
        credits: { director: 'Director A', cast: [{ name: 'Actor A' }] },
        sections: {
          productionNotes: ['p1'],
          historicalNotes: ['h1'],
          receptionNotes: ['r1'],
          techniqueBreakdown: ['t1'],
          influenceMap: ['i1'],
          afterWatchingReflection: ['r1', 'r2', 'r3'],
          trivia: ['t1', 't2', 't3', 't4', 't5'],
        },
        ratings: [],
        spoilerPolicy: 'FULL',
        evidence: [],
      },
      isFullyPopulated: true,
      expiresAt: new Date(Date.now() + 60_000),
      llmProvider: 'ollama',
      llmModel: 'glm-5:cloud',
    });

    const response = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=FULL', {
        headers: {
          cookie: makeSessionCookie('user_1'),
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.movie.title).toBe('Cached Title');
    expect(companionCacheUpsertMock).not.toHaveBeenCalled();
    expect(getLlmProviderFromEnvMock).not.toHaveBeenCalled();
  });

  it('uses llm output for light/full summaries and trivia when configured', async () => {
    process.env.LLM_PROVIDER = 'ollama';
    getLlmProviderFromEnvMock.mockReturnValue({
      name: () => 'ollama',
      generateJson: generateJsonMock,
    });
    generateJsonMock.mockResolvedValue({
      lightSummary: 'The setup and escalation build through the midpoint confrontation.',
      fullSummary: 'The protagonists fail at first, recover, and the ending reveals the true threat.',
      trivia: ['T1', 'T2', 'T3', 'T4', 'T5'],
    });
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValue({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
      director: 'Director A',
      castTop: [{ name: 'Actor A', role: 'Lead' }],
      ratings: [],
    });
    evidenceFindManyMock.mockResolvedValue([]);

    const lightResponse = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=LIGHT', {
        headers: {
          cookie: makeSessionCookie('user_1'),
        },
      }),
    );
    const fullResponse = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=FULL', {
        headers: {
          cookie: makeSessionCookie('user_1'),
        },
      }),
    );

    const light = await lightResponse.json();
    const full = await fullResponse.json();

    expect(generateJsonMock).toHaveBeenCalled();
    expect(light.data.sections.productionNotes.some((line: string) => line.includes('Act I-II summary: The setup and escalation'))).toBe(true);
    expect(full.data.sections.productionNotes.some((line: string) => line.includes('includes ending'))).toBe(true);
    expect(full.data.sections.trivia).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
  });

  it('generates once and caches all spoiler policies together when fully populated', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.TMDB_API_KEY = 'tmdb-test-key';
    getLlmProviderFromEnvMock.mockReturnValue({
      name: () => 'gemini',
      generateJson: generateJsonMock,
    });
    generateJsonMock.mockResolvedValue({
      lightSummary: 'Act I and II summary content.',
      fullSummary: 'Full arc summary including ending.',
      trivia: ['T1', 'T2', 'T3', 'T4', 'T5'],
    });
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValue({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Companion Test',
      year: 1999,
      posterUrl: 'https://img/123.jpg',
      director: 'Director A',
      castTop: [{ name: 'Actor A', role: 'Lead' }],
      ratings: [
        { source: 'IMDB', value: 7.1, scale: '10', rawValue: '7.1/10' },
        { source: 'ROTTEN_TOMATOES', value: 83, scale: '100', rawValue: '83%' },
      ],
    });
    evidenceFindManyMock.mockResolvedValue([]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 123,
        title: 'Companion Test',
        release_date: '1999-10-10',
        poster_path: '/poster.jpg',
        overview: 'A family arrives and confronts a rising threat with escalating stakes.',
        tagline: 'Fear returns.',
        runtime: 102,
        genres: [{ id: 27, name: 'Horror' }],
        production_countries: [{ iso_3166_1: 'US', name: 'United States' }],
        spoken_languages: [{ iso_639_1: 'en', english_name: 'English' }],
        vote_average: 7.4,
        vote_count: 2100,
        popularity: 51.2,
        credits: {
          cast: [{ name: 'Actor A', character: 'Lead' }],
          crew: [{ name: 'Director A', job: 'Director' }],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS', {
        headers: {
          cookie: makeSessionCookie('user_1'),
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
    expect(companionCacheUpsertMock).toHaveBeenCalledTimes(3);
    const policiesWritten = companionCacheUpsertMock.mock.calls
      .map((call) => call[0]?.where?.movieId_spoilerPolicy?.spoilerPolicy)
      .sort();
    expect(policiesWritten).toEqual(['FULL', 'LIGHT', 'NO_SPOILERS']);
  });

  it('includes codex data when recommendation item exists', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Test Film',
      year: 2020,
      posterUrl: 'https://img/123.jpg',
      director: 'Test Director',
      castTop: [],
    });
    evidenceFindManyMock.mockResolvedValueOnce([
      {
        sourceName: 'Source A',
        url: 'https://example.com/a',
        snippet: 'Snippet A',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    recommendationItemFindFirstMock.mockResolvedValueOnce({
      whyImportant: 'This film is important because...',
      whatItTeaches: 'Viewers learn about...',
      watchFor: ['Visual element 1', 'Sound design', 'Editing technique'],
    });

    const request = new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS', {
      headers: {
        cookie: makeSessionCookie('user_1'),
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.codex).toEqual({
      whyImportant: 'This film is important because...',
      whatItTeaches: 'Viewers learn about...',
      watchFor: ['Visual element 1', 'Sound design', 'Editing technique'],
    });
  });

  it('excludes codex when recommendation item does not exist', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    movieFindUniqueMock.mockResolvedValueOnce({
      id: 'movie_1',
      tmdbId: 123,
      title: 'Test Film',
      year: 2020,
      posterUrl: 'https://img/123.jpg',
      director: 'Test Director',
      castTop: [],
    });
    evidenceFindManyMock.mockResolvedValueOnce([
      {
        sourceName: 'Source A',
        url: 'https://example.com/a',
        snippet: 'Snippet A',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    recommendationItemFindFirstMock.mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS', {
      headers: {
        cookie: makeSessionCookie('user_1'),
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.codex).toBeUndefined();
  });
});
