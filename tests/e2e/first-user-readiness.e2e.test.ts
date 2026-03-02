import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { zMovieCardVM } from '@/contracts/movieCardVM';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { seedStarterHorrorCatalog } from '@/lib/testing/catalog-seed';

const schemaName = 'first_user_readiness_e2e_test';
const databaseUrl = buildTestDatabaseUrl(schemaName);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

vi.mock('@/lib/prisma', () => ({
  prisma,
}));

const { POST: POST_USERS } = await import('@/app/api/users/route');
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
  process.env.ADMIN_TOKEN = 'first-user-admin-token';
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
    const createUserA = await POST_USERS(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': 'first-user-admin-token' },
        body: JSON.stringify({ displayName: 'FirstUserA' }),
      }),
    );
    const createUserB = await POST_USERS(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': 'first-user-admin-token' },
        body: JSON.stringify({ displayName: 'FirstUserB' }),
      }),
    );
    expect(createUserA.status).toBe(200);
    expect(createUserB.status).toBe(200);
    const userAId = (await createUserA.json()).data.id as string;
    const userBId = (await createUserB.json()).data.id as string;

    const experienceBefore = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userAId },
      }),
    );
    expect(experienceBefore.status).toBe(200);
    expect((await experienceBefore.json()).data.state).toBe('ONBOARDING_NEEDED');

    const invalidOnboarding = await POST_ONBOARDING(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userAId,
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
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userAId,
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
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userBId,
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
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userAId },
      }),
    );
    expect(experienceAfter.status).toBe(200);
    expect((await experienceAfter.json()).data.state).toBe('SHOW_RECOMMENDATION_BUNDLE');

    const recommendationsA = await POST_RECOMMENDATIONS_NEXT(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userAId },
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
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userAId,
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
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userAId,
        },
        body: JSON.stringify({
          tmdbId: cardsA[0]!.movie.tmdbId,
          status: 'WATCHED',
          rating: 5,
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
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userAId,
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
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userBId },
      }),
    );
    const cardsB = (await recommendationsB.json()).data.cards as RecCard[];
    await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userBId,
        },
        body: JSON.stringify({
          tmdbId: cardsB[0]!.movie.tmdbId,
          status: 'WATCHED',
          rating: 2,
        }),
      }),
    );

    const alreadySeen2 = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userAId,
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
          'x-admin-token': 'first-user-admin-token',
          'x-user-id': userAId,
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
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userAId },
      }),
    );
    expect(historyA.status).toBe(200);
    const historyABody = await historyA.json();
    const statusesA = (historyABody.data.items as Array<{ status: string }>).map((item) => item.status);
    expect(statusesA).toContain('WATCHED');
    expect(statusesA).toContain('ALREADY_SEEN');

    const historyB = await GET_HISTORY(
      new Request('http://localhost/api/history', {
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userBId },
      }),
    );
    const historyBBody = await historyB.json();
    expect((historyBBody.data.items as Array<{ status: string }>)).toHaveLength(1);
    expect((historyBBody.data.items as Array<{ status: string }>)[0]?.status).toBe('WATCHED');

    const summaryA = await GET_HISTORY_SUMMARY(
      new Request('http://localhost/api/history/summary', {
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userAId },
      }),
    );
    expect(summaryA.status).toBe(200);
    const summaryABody = await summaryA.json();
    expect(summaryABody.data.countsByStatus.WATCHED).toBe(1);
    expect(summaryABody.data.countsByStatus.ALREADY_SEEN).toBe(3);
    expect(summaryABody.data.avgRatingWatchedOrAlreadySeen).toBe(3.5);

    const companionNoSpoilers = await GET_COMPANION(
      new Request(`http://localhost/api/companion?tmdbId=${cardsA[4]!.movie.tmdbId}&spoilerPolicy=NO_SPOILERS`, {
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userAId },
      }),
    );
    const companionLight = await GET_COMPANION(
      new Request(`http://localhost/api/companion?tmdbId=${cardsA[4]!.movie.tmdbId}&spoilerPolicy=LIGHT`, {
        headers: { 'x-admin-token': 'first-user-admin-token', 'x-user-id': userAId },
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
