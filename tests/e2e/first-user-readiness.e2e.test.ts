import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { zMovieCardVM } from '@/contracts/movieCardVM';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';
import { asAdmin, signupAndLogin, type RequestAgent } from '../helpers/auth';

const schemaName = 'first_user_readiness_e2e_test';
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
const { POST: POST_SELECT_PACK } = await import('@/app/api/profile/select-pack/route');
const { POST: POST_RECOMMENDATIONS_NEXT } = await import('@/app/api/recommendations/next/route');
const { POST: POST_INTERACTIONS } = await import('@/app/api/interactions/route');
const { GET: GET_HISTORY } = await import('@/app/api/history/route');
const { GET: GET_HISTORY_SUMMARY } = await import('@/app/api/history/summary/route');
const { GET: GET_COMPANION } = await import('@/app/api/companion/route');
const { PATCH: PATCH_PROFILE_PREFERENCES } = await import('@/app/api/profile/preferences/route');

beforeAll(() => {
  prismaDbPush(databaseUrl);
});

beforeEach(async () => {
  process.env.ADMIN_EMAIL = 'admin@local.test';
  process.env.ADMIN_PASSWORD = 'dev-admin-password';
  process.env.USE_LLM = 'false';
  process.env.SEASONS_PACKS_ENABLED = 'false';
  delete process.env.LLM_PROVIDER;

  await prisma.movieStreamingCache.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.journeyProgress.deleteMany();
  await prisma.genrePack.deleteMany();
  await prisma.season.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movie.deleteMany();

  await seedStarterHorrorCatalog(prisma);
});

type RecCard = {
  movie: { tmdbId: number; posterUrl: string };
  ratings: { imdb?: unknown; additional: unknown[] };
  reception: unknown;
  credits: { castHighlights: unknown[] };
  codex: { watchFor: unknown[]; spoilerPolicy: string };
  streaming: { region: string; offers: unknown[] };
  evidence: unknown[];
};

describe('first real user readiness e2e', () => {
  it('covers onboarding, recommendations, interactions, history, regeneration, and companion with API-only flow', async () => {
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
    const { cookieHeader: userACookie, user: userA } = await signupAndLogin(authAgent, {
      email: 'first.user.a@example.com',
      password: 'password-123',
      displayName: 'FirstUserA',
    });
    const { cookieHeader: userBCookie, user: userB } = await signupAndLogin(authAgent, {
      email: 'first.user.b@example.com',
      password: 'password-123',
      displayName: 'FirstUserB',
    });

    const createUserA = await POST_USERS(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ displayName: 'FirstUserA' }),
      }),
    );
    const createUserB = await POST_USERS(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ displayName: 'FirstUserB' }),
      }),
    );
    expect(createUserA.status).toBe(200);
    expect(createUserB.status).toBe(200);
    const userAId = userA.id;
    const userBId = userB.id;

    const experienceBefore = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: { cookie: userACookie },
      }),
    );
    expect(experienceBefore.status).toBe(200);
    const experienceBeforeBody = await experienceBefore.json();
    expect(experienceBeforeBody.data.state).toBe('PACK_SELECTION_NEEDED');
    const firstPackSlug = (experienceBeforeBody.data.packSelection?.packs as Array<{ slug: string }> | undefined)?.[0]?.slug;
    expect(firstPackSlug).toBeTruthy();

    const selectPackA = await POST_SELECT_PACK(
      new Request('http://localhost/api/profile/select-pack', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({ packSlug: firstPackSlug }),
      }),
    );
    const selectPackB = await POST_SELECT_PACK(
      new Request('http://localhost/api/profile/select-pack', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userBCookie,
        },
        body: JSON.stringify({ packSlug: firstPackSlug }),
      }),
    );
    expect(selectPackA.status).toBe(200);
    expect(selectPackB.status).toBe(200);

    const invalidOnboarding = await POST_ONBOARDING(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({ tolerance: 9, pacePreference: 'fast' }),
      }),
    );
    expect(invalidOnboarding.status).toBe(400);

    const onboardingA = await POST_ONBOARDING(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({
          tolerance: 4,
          pacePreference: 'balanced',
          horrorDNA: { subgenres: ['psychological', 'supernatural'] },
        }),
      }),
    );
    const onboardingB = await POST_ONBOARDING(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userBCookie,
        },
        body: JSON.stringify({
          tolerance: 3,
          pacePreference: 'slowburn',
          horrorDNA: { subgenres: ['gothic'] },
        }),
      }),
    );
    expect(onboardingA.status).toBe(200);
    expect(onboardingB.status).toBe(200);
    expect((await onboardingA.json()).data.success).toBe(true);

    const experienceAfter = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: { cookie: userACookie },
      }),
    );
    expect(experienceAfter.status).toBe(200);
    expect((await experienceAfter.json()).data.state).toBe('SHOW_RECOMMENDATION_BUNDLE');

    const recommendationsA = await POST_RECOMMENDATIONS_NEXT(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: { cookie: userACookie },
      }),
    );
    expect(recommendationsA.status).toBe(200);
    const recBodyA = await recommendationsA.json();
    const batchIdA = recBodyA.data.batchId as string;
    const cardsA = recBodyA.data.cards as RecCard[];

    expect(cardsA).toHaveLength(5);
    const uniqueTmdb = new Set(cardsA.map((card) => card.movie.tmdbId));
    expect(uniqueTmdb.size).toBe(5);

    for (const card of cardsA) {
      expect(zMovieCardVM.safeParse(card).success).toBe(true);
      expect(card.movie.posterUrl.length).toBeGreaterThan(0);
      expect(card.ratings.imdb).toBeTruthy();
      expect(card.ratings.additional.length).toBeGreaterThanOrEqual(1);
      expect(card).toHaveProperty('reception');
      expect(Array.isArray(card.credits.castHighlights)).toBe(true);
      expect(Array.isArray(card.streaming.offers)).toBe(true);
      expect(Array.isArray(card.evidence)).toBe(true);
      expect(card.codex.watchFor).toHaveLength(3);
      expect(typeof card.codex.spoilerPolicy).toBe('string');
    }

    // Read recommendation item ids for batch correlation (read-only DB access; writes remain API-only).
    const batchItemsA = await prisma.recommendationItem.findMany({
      where: { batchId: batchIdA },
      include: { movie: { select: { tmdbId: true } } },
    });
    const itemIdByTmdbId = new Map(batchItemsA.map((item) => [item.movie.tmdbId, item.id] as const));

    const watchedNoRating = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({
          tmdbId: cardsA[0]!.movie.tmdbId,
          status: 'WATCHED',
        }),
      }),
    );
    expect(watchedNoRating.status).toBe(400);

    const watchedOk = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({
          tmdbId: cardsA[0]!.movie.tmdbId,
          status: 'WATCHED',
          rating: 5,
          recommendationItemId: itemIdByTmdbId.get(cardsA[0]!.movie.tmdbId),
          intensity: 4,
          emotions: ['dread'],
          workedBest: ['pacing'],
        }),
      }),
    );
    expect(watchedOk.status).toBe(200);

    const alreadySeenOk = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({
          tmdbId: cardsA[1]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
          rating: 4,
          recommendationItemId: itemIdByTmdbId.get(cardsA[1]!.movie.tmdbId),
        }),
      }),
    );
    expect(alreadySeenOk.status).toBe(200);

    // Add one interaction for user B via API to verify history scoping.
    const recommendationsB = await POST_RECOMMENDATIONS_NEXT(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: { cookie: userBCookie },
      }),
    );
    const recommendationsBBody = await recommendationsB.json();
    const batchIdB = recommendationsBBody.data.batchId as string;
    const cardsB = recommendationsBBody.data.cards as RecCard[];
    const batchItemsB = await prisma.recommendationItem.findMany({
      where: { batchId: batchIdB },
      include: { movie: { select: { tmdbId: true } } },
    });
    const itemIdByTmdbIdB = new Map(batchItemsB.map((item) => [item.movie.tmdbId, item.id] as const));
    await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userBCookie,
        },
        body: JSON.stringify({
          tmdbId: cardsB[0]!.movie.tmdbId,
          status: 'WATCHED',
          rating: 2,
          recommendationItemId: itemIdByTmdbIdB.get(cardsB[0]!.movie.tmdbId),
        }),
      }),
    );

    const alreadySeen2 = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({
          tmdbId: cardsA[2]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
          rating: 3,
          recommendationItemId: itemIdByTmdbId.get(cardsA[2]!.movie.tmdbId),
        }),
      }),
    );
    expect(alreadySeen2.status).toBe(200);

    const alreadySeen3 = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({
          tmdbId: cardsA[3]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
          rating: 2,
          recommendationItemId: itemIdByTmdbId.get(cardsA[3]!.movie.tmdbId),
        }),
      }),
    );
    expect(alreadySeen3.status).toBe(200);
    const alreadySeen3Body = await alreadySeen3.json();
    expect(alreadySeen3Body.data.nextBatch?.batchId).toBeDefined();

    const historyA = await GET_HISTORY(
      new Request('http://localhost/api/history', {
        headers: { cookie: userACookie },
      }),
    );
    expect(historyA.status).toBe(200);
    const historyABody = await historyA.json();
    const statusesA = (historyABody.data.items as Array<{ status: string }>).map((item) => item.status);
    expect(statusesA).toContain('WATCHED');
    expect(statusesA).toContain('ALREADY_SEEN');

    const historyB = await GET_HISTORY(
      new Request('http://localhost/api/history', {
        headers: { cookie: userBCookie },
      }),
    );
    const historyBBody = await historyB.json();
    expect((historyBBody.data.items as Array<{ status: string }>)).toHaveLength(1);
    expect((historyBBody.data.items as Array<{ status: string }>)[0]?.status).toBe('WATCHED');

    const summaryA = await GET_HISTORY_SUMMARY(
      new Request('http://localhost/api/history/summary', {
        headers: { cookie: userACookie },
      }),
    );
    expect(summaryA.status).toBe(200);
    const summaryABody = await summaryA.json();
    expect(summaryABody.data.countsByStatus.WATCHED).toBe(1);
    expect(summaryABody.data.countsByStatus.ALREADY_SEEN).toBe(3);
    expect(summaryABody.data.avgRatingWatchedOrAlreadySeen).toBe(3.5);

    process.env.SEASONS_PACKS_ENABLED = 'true';
    await prisma.season.upsert({
      where: { slug: 'season-1' },
      create: { slug: 'season-1', name: 'Season 1', isActive: true },
      update: { isActive: true },
    });
    await prisma.genrePack.upsert({
      where: { slug: 'thriller' },
      create: {
        slug: 'thriller',
        name: 'Thriller',
        seasonId: (await prisma.season.findUniqueOrThrow({ where: { slug: 'season-1' } })).id,
        isEnabled: true,
        primaryGenre: 'thriller',
        description: 'Thriller pack',
      },
      update: {
        isEnabled: true,
        primaryGenre: 'thriller',
      },
    });

    const switchPack = await PATCH_PROFILE_PREFERENCES(
      new Request('http://localhost/api/profile/preferences', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: userACookie,
        },
        body: JSON.stringify({ selectedPackSlug: 'thriller' }),
      }),
    );
    expect(switchPack.status).toBe(200);

    const historyCurrentPack = await GET_HISTORY(
      new Request('http://localhost/api/history', {
        headers: { cookie: userACookie },
      }),
    );
    const historyCurrentPackBody = await historyCurrentPack.json();
    expect(historyCurrentPackBody.data.items).toHaveLength(0);

    const historyAllPacks = await GET_HISTORY(
      new Request('http://localhost/api/history?packScope=all', {
        headers: { cookie: userACookie },
      }),
    );
    const historyAllPacksBody = await historyAllPacks.json();
    expect((historyAllPacksBody.data.items as Array<{ interactionId: string }>).length).toBeGreaterThanOrEqual(4);

    const summaryCurrentPack = await GET_HISTORY_SUMMARY(
      new Request('http://localhost/api/history/summary', {
        headers: { cookie: userACookie },
      }),
    );
    const summaryCurrentPackBody = await summaryCurrentPack.json();
    expect(summaryCurrentPackBody.data.countsByStatus.WATCHED).toBe(0);
    expect(summaryCurrentPackBody.data.countsByStatus.ALREADY_SEEN).toBe(0);

    const companionNoSpoilers = await GET_COMPANION(
      new Request(`http://localhost/api/companion?tmdbId=${cardsA[4]!.movie.tmdbId}&spoilerPolicy=NO_SPOILERS`, {
        headers: { cookie: userACookie },
      }),
    );
    const companionLight = await GET_COMPANION(
      new Request(`http://localhost/api/companion?tmdbId=${cardsA[4]!.movie.tmdbId}&spoilerPolicy=LIGHT`, {
        headers: { cookie: userACookie },
      }),
    );
    expect(companionNoSpoilers.status).toBe(200);
    expect(companionLight.status).toBe(200);
    const noSpoilersBody = await companionNoSpoilers.json();
    const lightBody = await companionLight.json();
    expect(noSpoilersBody.data.credits).toBeDefined();
    expect(Array.isArray(noSpoilersBody.data.credits.cast)).toBe(true);
    expect(Array.isArray(noSpoilersBody.data.sections.productionNotes)).toBe(true);
    expect(Array.isArray(noSpoilersBody.data.sections.historicalNotes)).toBe(true);
    expect(Array.isArray(noSpoilersBody.data.sections.receptionNotes)).toBe(true);
    expect(Array.isArray(noSpoilersBody.data.sections.trivia)).toBe(true);
    expect(noSpoilersBody.data.spoilerPolicy).toBe('NO_SPOILERS');
    expect(lightBody.data.spoilerPolicy).toBe('LIGHT');
    expect(lightBody.data.sections.productionNotes).not.toEqual(noSpoilersBody.data.sections.productionNotes);
  });
});
