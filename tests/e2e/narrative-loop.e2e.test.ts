import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { zMovieCardVM } from '@/contracts/movieCardVM';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';
import { asAdmin, signupAndLogin, type RequestAgent } from '../helpers/auth';

const schemaName = 'narrative_loop_e2e_test';
const databaseUrl = buildTestDatabaseUrl(schemaName);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

vi.mock('@/lib/prisma', () => ({
  prisma,
}));

const { POST: POST_USERS } = await import('@/app/api/users/route');
const { POST: POST_AUTH_LOGIN } = await import('@/app/api/auth/login/route');
const { POST: POST_AUTH_SIGNUP } = await import('@/app/api/auth/signup/route');
const { GET: GET_EXPERIENCE } = await import('@/app/api/experience/route');
const { POST: POST_ONBOARDING } = await import('@/app/api/onboarding/route');
const { POST: POST_RECOMMENDATIONS_NEXT } = await import('@/app/api/recommendations/next/route');
const { POST: POST_INTERACTIONS } = await import('@/app/api/interactions/route');
const { GET: GET_HISTORY } = await import('@/app/api/history/route');
const { GET: GET_HISTORY_SUMMARY } = await import('@/app/api/history/summary/route');
const { GET: GET_COMPANION } = await import('@/app/api/companion/route');

beforeAll(() => {
  prismaDbPush(databaseUrl);
});

beforeEach(async () => {
  process.env.ADMIN_EMAIL = 'admin@local.test';
  process.env.ADMIN_PASSWORD = 'dev-admin-password';
  process.env.USE_LLM = 'false';
  delete process.env.LLM_PROVIDER;

  await prisma.movieStreamingCache.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movie.deleteMany();

  await seedStarterHorrorCatalog(prisma);
});

describe('narrative loop e2e', () => {
  it('proves the core narrative loop end-to-end with deterministic behavior', async () => {
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
      email: 'e2e.tester@example.com',
      password: 'password-123',
      displayName: 'E2E Tester',
    });

    const createUserResponse = await POST_USERS(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
        },
        body: JSON.stringify({ displayName: 'E2E Tester' }),
      }),
    );
    expect(createUserResponse.status).toBe(200);
    const userId = user.id;

    const beforeOnboardingResponse = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(beforeOnboardingResponse.status).toBe(200);
    const beforeOnboarding = await beforeOnboardingResponse.json();
    expect(beforeOnboarding.data.state).toBe('ONBOARDING_NEEDED');

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
          horrorDNA: { subgenres: ['slasher', 'psychological'] },
        }),
      }),
    );
    expect(onboardingResponse.status).toBe(200);

    const afterOnboardingResponse = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(afterOnboardingResponse.status).toBe(200);
    const afterOnboarding = await afterOnboardingResponse.json();
    expect(afterOnboarding.data.state).toBe('SHOW_RECOMMENDATION_BUNDLE');

    const start = Date.now();
    const recommendationsResponse = await POST_RECOMMENDATIONS_NEXT(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          cookie: userCookie,
        },
      }),
    );
    const durationMs = Date.now() - start;
    expect(recommendationsResponse.status).toBe(200);
    const recommendations = await recommendationsResponse.json();
    const batchId = recommendations.data.batchId as string;
    const cards = recommendations.data.cards as Array<{ movie: { tmdbId: number; posterUrl: string }; ratings: { imdb?: unknown; additional: unknown[] }; codex: { watchFor: unknown[] }; streaming: { region: string; offers: unknown[] }; evidence: unknown[] }>;

    expect(cards).toHaveLength(5);
    expect(durationMs).toBeLessThan(5000);

    const batchItems = await prisma.recommendationItem.findMany({
      where: { batchId },
      include: { movie: { select: { tmdbId: true } } },
    });
    const itemIdByTmdbId = new Map(batchItems.map((item) => [item.movie.tmdbId, item.id] as const));

    for (const card of cards) {
      expect(zMovieCardVM.safeParse(card).success).toBe(true);
      expect(card.movie.posterUrl.length).toBeGreaterThan(0);
      expect(card.ratings.imdb).toBeTruthy();
      expect(card.ratings.additional.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(card.streaming.offers)).toBe(true);
      expect(Array.isArray(card.evidence)).toBe(true);
      expect(card.codex.watchFor).toHaveLength(3);

      const sizeBytes = Buffer.byteLength(JSON.stringify(card), 'utf-8');
      expect(sizeBytes).toBeLessThan(50 * 1024);
    }

    const missingRatingAlreadySeen = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tmdbId: cards[0]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
          recommendationItemId: itemIdByTmdbId.get(cards[0]!.movie.tmdbId),
        }),
      }),
    );
    expect(missingRatingAlreadySeen.status).toBe(400);

    const alreadySeen1 = await POST_INTERACTIONS(
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
          recommendationItemId: itemIdByTmdbId.get(cards[0]!.movie.tmdbId),
          intensity: 3,
          emotions: ['tense'],
          workedBest: ['pacing'],
        }),
      }),
    );
    expect(alreadySeen1.status).toBe(200);

    const watched = await POST_INTERACTIONS(
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
          intensity: 4,
          emotions: ['dread'],
          workedBest: ['direction'],
        }),
      }),
    );
    expect(watched.status).toBe(200);

    const historyResponse = await GET_HISTORY(
      new Request('http://localhost/api/history', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(historyResponse.status).toBe(200);
    const history = await historyResponse.json();
    const historyStatuses = (history.data.items as Array<{ status: string }>).map((item) => item.status);
    expect(historyStatuses).toContain('ALREADY_SEEN');
    expect(historyStatuses).toContain('WATCHED');
    expect((history.data.items as Array<{ interactionId: string }>).length).toBe(2);

    const summaryResponse = await GET_HISTORY_SUMMARY(
      new Request('http://localhost/api/history/summary', {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(summaryResponse.status).toBe(200);
    const summary = await summaryResponse.json();
    expect(summary.data.countsByStatus.WATCHED).toBe(1);
    expect(summary.data.countsByStatus.ALREADY_SEEN).toBe(1);
    expect(summary.data.avgRatingWatchedOrAlreadySeen).toBe(4.5);

    const companionResponse = await GET_COMPANION(
      new Request(`http://localhost/api/companion?tmdbId=${cards[0]!.movie.tmdbId}&spoilerPolicy=NO_SPOILERS`, {
        headers: {
          cookie: userCookie,
        },
      }),
    );
    expect(companionResponse.status).toBe(200);
    const companion = await companionResponse.json();
    expect(companion.data.spoilerPolicy).toBe('NO_SPOILERS');
    expect(companion.data.credits).toBeDefined();
    expect(Array.isArray(companion.data.credits.cast)).toBe(true);

    const alreadySeen2 = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tmdbId: cards[2]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
          rating: 3,
          recommendationItemId: itemIdByTmdbId.get(cards[2]!.movie.tmdbId),
        }),
      }),
    );
    expect(alreadySeen2.status).toBe(200);

    const alreadySeen3 = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tmdbId: cards[3]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
          rating: 2,
          recommendationItemId: itemIdByTmdbId.get(cards[3]!.movie.tmdbId),
        }),
      }),
    );
    expect(alreadySeen3.status).toBe(200);
    const alreadySeen3Body = await alreadySeen3.json();
    expect(alreadySeen3Body.data.nextBatch?.batchId).toBeDefined();
    expect(alreadySeen3Body.data.nextBatch.batchId).not.toBe(batchId);
  });
});
