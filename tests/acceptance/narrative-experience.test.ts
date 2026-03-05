import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { zMovieCardVM } from '@/contracts/movieCardVM';
import {
  createAcceptancePrisma,
  resetAcceptanceDatabase,
  setupAcceptanceDatabase,
} from './utils/recommendations-seed';
import { asAdmin, signupAndLogin, type RequestAgent } from '../helpers/auth';

const acceptanceSchemaName = 'narrative_experience_acceptance_test';
const acceptancePrisma = createAcceptancePrisma(acceptanceSchemaName);

vi.mock('@/lib/prisma', () => ({
  prisma: acceptancePrisma,
}));

const { POST: POST_USERS } = await import('@/app/api/users/route');
const { POST: POST_AUTH_LOGIN } = await import('@/app/api/auth/login/route');
const { POST: POST_AUTH_SIGNUP } = await import('@/app/api/auth/signup/route');
const { POST: POST_ONBOARDING } = await import('@/app/api/onboarding/route');
const { POST: POST_SELECT_PACK } = await import('@/app/api/profile/select-pack/route');
const { GET: GET_EXPERIENCE } = await import('@/app/api/experience/route');
const { POST: POST_RECOMMENDATIONS_NEXT } = await import('@/app/api/recommendations/next/route');
const { POST: POST_INTERACTIONS } = await import('@/app/api/interactions/route');
const { GET: GET_HISTORY } = await import('@/app/api/history/route');
const { GET: GET_HISTORY_SUMMARY } = await import('@/app/api/history/summary/route');
const { GET: GET_COMPANION } = await import('@/app/api/companion/route');

type RecommendationCard = {
  movie: {
    tmdbId: number;
    posterUrl: string;
  };
  ratings: {
    imdb?: unknown;
    additional: unknown[];
  };
  reception: unknown;
  credits: {
    castHighlights: unknown[];
  };
  codex: {
    watchFor: unknown[];
  };
  evidence: unknown[];
  streaming: {
    region: string;
    offers: unknown[];
  };
};

async function seedMovieCatalog(): Promise<void> {
  for (let index = 0; index < 7; index += 1) {
    const tmdbId = 1100 + index;
    const movie = await acceptancePrisma.movie.create({
      data: {
        tmdbId,
        title: `Narrative Acceptance ${tmdbId}`,
        year: 1985 + index,
        posterUrl: `https://image.tmdb.org/t/p/w500/${tmdbId}.jpg`,
        genres: ['horror', index % 2 === 0 ? 'psychological' : 'supernatural'],
        director: index === 0 ? 'Director Seed' : null,
        castTop: index === 0 ? [{ name: 'Performer One', role: 'Lead' }] : [],
      },
    });

    await acceptancePrisma.movieRating.createMany({
      data: [
        { movieId: movie.id, source: 'IMDB', value: 7.2 + index * 0.1, scale: '10', rawValue: `${(7.2 + index * 0.1).toFixed(1)}/10` },
        { movieId: movie.id, source: 'ROTTEN_TOMATOES', value: 71 + index, scale: '100', rawValue: `${71 + index}%` },
        { movieId: movie.id, source: 'METACRITIC', value: 66 + index, scale: '100', rawValue: `${66 + index}/100` },
      ],
    });

    await acceptancePrisma.evidencePacket.create({
      data: {
        movieId: movie.id,
        sourceName: 'Acceptance Evidence',
        url: `https://example.com/evidence/${tmdbId}`,
        snippet: `Evidence snippet for ${tmdbId}`,
        retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  }
}

describe('narrative experience acceptance', () => {
  beforeAll(() => {
    setupAcceptanceDatabase(acceptanceSchemaName);
  });

  beforeEach(async () => {
    process.env.ADMIN_EMAIL = 'admin@local.test';
    process.env.ADMIN_PASSWORD = 'dev-admin-password';
    delete process.env.REC_ENGINE_MODE;
    await resetAcceptanceDatabase(acceptancePrisma);
    await seedMovieCatalog();
  });

  it('enforces onboarding -> recommendations -> interactions -> history -> companion flow', async () => {
    const authAgent: RequestAgent = (path, init = {}) => {
      const method = (init.method ?? 'GET').toUpperCase();
      const headers = new Headers(init.headers);
      if (init.json !== undefined) {
        headers.set('content-type', 'application/json');
      }
      const body = init.json !== undefined ? JSON.stringify(init.json) : (init.body as BodyInit | null | undefined);
      const request = new Request(`http://localhost${path}`, { ...init, method, headers, body });
      if (path === '/api/auth/login' && method === 'POST') {
        return POST_AUTH_LOGIN(request);
      }
      if (path === '/api/auth/signup' && method === 'POST') {
        return POST_AUTH_SIGNUP(request);
      }
      throw new Error(`Unsupported auth route: ${method} ${path}`);
    };

    const { cookieHeader: adminCookie } = await asAdmin(authAgent);
    const { cookieHeader: userCookie, user } = await signupAndLogin(authAgent, {
      email: 'narrative.user.a@example.com',
      password: 'password-123',
      displayName: 'NarrativeUserA',
    });
    const { cookieHeader: otherUserCookie } = await signupAndLogin(authAgent, {
      email: 'narrative.user.b@example.com',
      password: 'password-123',
      displayName: 'NarrativeUserB',
    });

    const createUserResponse = await POST_USERS(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ displayName: 'NarrativeUserA' }),
      }),
    );

    expect(createUserResponse.status).toBe(200);
    const userId = user.id;

    const experienceBeforeOnboarding = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(experienceBeforeOnboarding.status).toBe(200);
    const beforeOnboardingBody = await experienceBeforeOnboarding.json();
    expect(beforeOnboardingBody.data.state).toBe('PACK_SELECTION_NEEDED');
    const firstPackSlug = (beforeOnboardingBody.data.packSelection?.packs as Array<{ slug: string }> | undefined)?.[0]?.slug;
    expect(firstPackSlug).toBeTruthy();

    const selectPackResponse = await POST_SELECT_PACK(
      new Request('http://localhost/api/profile/select-pack', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({ packSlug: firstPackSlug }),
      }),
    );
    expect(selectPackResponse.status).toBe(200);

    const experienceAfterPackSelect = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(experienceAfterPackSelect.status).toBe(200);
    const afterPackBody = await experienceAfterPackSelect.json();
    expect(afterPackBody.data.state).toBe('ONBOARDING_NEEDED');
    expect(Array.isArray(afterPackBody.data.onboardingQuestions)).toBe(true);

    const onboardingResponse = await POST_ONBOARDING(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tolerance: 4,
          pacePreference: 'balanced',
          horrorDNA: { subgenres: ['psychological', 'supernatural'] },
        }),
      }),
    );
    expect(onboardingResponse.status).toBe(200);

    const experienceAfterOnboarding = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(experienceAfterOnboarding.status).toBe(200);
    const afterOnboardingBody = await experienceAfterOnboarding.json();
    expect(afterOnboardingBody.data.state).toBe('SHOW_RECOMMENDATION_BUNDLE');

    const recommendationsResponse = await POST_RECOMMENDATIONS_NEXT(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(recommendationsResponse.status).toBe(200);
    const recommendationsBody = await recommendationsResponse.json();
    expect(Array.isArray(recommendationsBody.data.cards)).toBe(true);
    expect(recommendationsBody.data.cards).toHaveLength(5);
    const batchId = recommendationsBody.data.batchId as string;

    const cards = recommendationsBody.data.cards as RecommendationCard[];
    const recommendationItems = await acceptancePrisma.recommendationItem.findMany({
      where: { batchId },
      include: { movie: { select: { tmdbId: true } } },
    });
    const recommendationItemIdByTmdbId = new Map(recommendationItems.map((item) => [item.movie.tmdbId, item.id] as const));

    for (const card of cards) {
      expect(zMovieCardVM.safeParse(card).success).toBe(true);
      expect(typeof card.movie.posterUrl).toBe('string');
      expect(card.movie.posterUrl.length).toBeGreaterThan(0);
      expect(Boolean(card.ratings.imdb)).toBe(true);
      expect(card.ratings.additional.length).toBeGreaterThanOrEqual(1);
      expect(card).toHaveProperty('reception');
      expect(card).toHaveProperty('evidence');
      expect(Array.isArray(card.evidence)).toBe(true);
      expect(card).toHaveProperty('streaming');
      expect(typeof card.streaming.region).toBe('string');
      expect(Array.isArray(card.streaming.offers)).toBe(true);
      expect(card.codex.watchFor).toHaveLength(3);
      // R8 allows cast highlights "where available"; empty array is the documented fallback for missing cast metadata.
      expect(Array.isArray(card.credits.castHighlights)).toBe(true);
    }

    const alreadySeenWithoutRating = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tmdbId: cards[0]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
        }),
      }),
    );
    expect(alreadySeenWithoutRating.status).toBe(400);

    const watchedWithoutRating = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tmdbId: cards[1]!.movie.tmdbId,
          status: 'WATCHED',
        }),
      }),
    );
    expect(watchedWithoutRating.status).toBe(400);

    const alreadySeenWithQuickPoll = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tmdbId: cards[0]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
          rating: 4,
          recommendationItemId: recommendationItemIdByTmdbId.get(cards[0]!.movie.tmdbId),
          intensity: 3,
          emotions: ['tense'],
          workedBest: ['pacing'],
          agedWell: 'yes',
        }),
      }),
    );
    expect(alreadySeenWithQuickPoll.status).toBe(200);

    const watchedWithQuickPoll = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tmdbId: cards[1]!.movie.tmdbId,
          status: 'WATCHED',
          rating: 5,
          recommendationItemId: recommendationItemIdByTmdbId.get(cards[1]!.movie.tmdbId),
          intensity: 4,
          emotions: ['dread'],
          workedBest: ['sound design'],
          agedWell: 'mostly',
        }),
      }),
    );
    expect(watchedWithQuickPoll.status).toBe(200);

    await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: otherUserCookie,
        },
        body: JSON.stringify({
          tmdbId: 1106,
          status: 'WATCHED',
          rating: 2,
        }),
      }),
    );

    const historyResponse = await GET_HISTORY(
      new Request('http://localhost/api/history?limit=20', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(historyResponse.status).toBe(200);
    const historyBody = await historyResponse.json();
    const historyItems = historyBody.data.items as Array<{ status: string; movie: { tmdbId: number } }>;
    expect(historyItems.length).toBe(2);
    expect(historyItems.some((item) => item.status === 'ALREADY_SEEN')).toBe(true);
    expect(historyItems.some((item) => item.status === 'WATCHED')).toBe(true);
    expect(historyItems.every((item) => item.movie.tmdbId !== 1106)).toBe(true);

    const historySummaryResponse = await GET_HISTORY_SUMMARY(
      new Request('http://localhost/api/history/summary', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(historySummaryResponse.status).toBe(200);
    const summaryBody = await historySummaryResponse.json();
    expect(summaryBody.data.countsByStatus.ALREADY_SEEN).toBe(1);
    expect(summaryBody.data.countsByStatus.WATCHED).toBe(1);
    expect(summaryBody.data.avgRatingWatchedOrAlreadySeen).toBe(4.5);

    const companionResponse = await GET_COMPANION(
      new Request(`http://localhost/api/companion?tmdbId=${cards[0]!.movie.tmdbId}&spoilerPolicy=NO_SPOILERS`, {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(companionResponse.status).toBe(200);
    const companionBody = await companionResponse.json();
    expect(companionBody.data.spoilerPolicy).toBe('NO_SPOILERS');
    expect(companionBody.data.movie.tmdbId).toBe(cards[0]!.movie.tmdbId);
    expect(Array.isArray(companionBody.data.sections.productionNotes)).toBe(true);
    expect(Array.isArray(companionBody.data.evidence)).toBe(true);
  });
});
