import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { signupAndLogin, type RequestAgent } from '../helpers/auth';

const schemaName = 'history_pack_scope_e2e_test';
const databaseUrl = buildTestDatabaseUrl(schemaName);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

vi.mock('@/lib/prisma', () => ({
  prisma,
}));

const { POST: POST_AUTH_LOGIN } = await import('@/app/api/auth/login/route');
const { POST: POST_AUTH_SIGNUP } = await import('@/app/api/auth/signup/route');
const { POST: POST_ONBOARDING } = await import('@/app/api/onboarding/route');
const { PATCH: PATCH_PROFILE_PREFERENCES } = await import('@/app/api/profile/preferences/route');
const { POST: POST_INTERACTIONS } = await import('@/app/api/interactions/route');
const { GET: GET_HISTORY } = await import('@/app/api/history/route');
const { GET: GET_HISTORY_SUMMARY } = await import('@/app/api/history/summary/route');

beforeAll(() => {
  prismaDbPush(databaseUrl);
});

beforeEach(async () => {
  process.env.ADMIN_EMAIL = 'admin@local.test';
  process.env.ADMIN_PASSWORD = 'dev-admin-password';
  process.env.USE_LLM = 'false';
  process.env.SEASONS_PACKS_ENABLED = 'true';
  delete process.env.LLM_PROVIDER;

  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.userCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.genrePack.deleteMany();
  await prisma.season.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();
});

describe('history pack scoping e2e', () => {
  it('scopes default history to current pack and supports packScope=all', async () => {
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

    const season = await prisma.season.create({
      data: { slug: 'season-1', name: 'Season 1', isActive: true },
    });
    const horrorPack = await prisma.genrePack.create({
      data: {
        slug: 'horror',
        name: 'Horror',
        seasonId: season.id,
        isEnabled: true,
        primaryGenre: 'horror',
      },
    });
    await prisma.genrePack.create({
      data: {
        slug: 'thriller',
        name: 'Thriller',
        seasonId: season.id,
        isEnabled: true,
        primaryGenre: 'thriller',
      },
    });
    const movie = await prisma.movie.create({
      data: {
        tmdbId: 991001,
        title: 'Pack Scope Test Movie',
        year: 2020,
        posterUrl: 'https://image.tmdb.org/t/p/w500/test.jpg',
        genres: ['horror'],
      },
    });
    await prisma.movieRating.createMany({
      data: [
        { movieId: movie.id, source: 'IMDb', value: 7.1, scale: '10', rawValue: '7.1/10' },
        { movieId: movie.id, source: 'TMDB', value: 6.8, scale: '10', rawValue: '6.8/10' },
      ],
    });

    const { cookieHeader: userCookie, user } = await signupAndLogin(authAgent, {
      email: 'pack.scope.user@example.com',
      password: 'password-123',
      displayName: 'Pack Scope User',
    });

    const onboarding = await POST_ONBOARDING(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tolerance: 3,
          pacePreference: 'balanced',
          selectedPackSlug: 'horror',
        }),
      }),
    );
    expect(onboarding.status).toBe(200);

    const batch = await prisma.recommendationBatch.create({
      data: {
        userId: user.id,
        packId: horrorPack.id,
        journeyNode: 'ENGINE_MODERN_CORE',
      },
    });
    const item = await prisma.recommendationItem.create({
      data: {
        batchId: batch.id,
        movieId: movie.id,
        rank: 1,
        whyImportant: 'why',
        whatItTeaches: 'what',
        historicalContext: 'history',
        nextStepHint: 'next',
        watchFor: ['a', 'b', 'c'],
        spoilerPolicy: 'NO_SPOILERS',
      },
    });

    const watched = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({
          tmdbId: movie.tmdbId,
          status: 'WATCHED',
          rating: 4,
          recommendationItemId: item.id,
        }),
      }),
    );
    expect(watched.status).toBe(200);

    const historyHorror = await GET_HISTORY(
      new Request('http://localhost/api/history', {
        headers: { cookie: userCookie },
      }),
    );
    expect(historyHorror.status).toBe(200);
    expect((await historyHorror.json()).data.items).toHaveLength(1);

    const switchPack = await PATCH_PROFILE_PREFERENCES(
      new Request('http://localhost/api/profile/preferences', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: userCookie,
        },
        body: JSON.stringify({ selectedPackSlug: 'thriller' }),
      }),
    );
    expect(switchPack.status).toBe(200);

    const historyCurrentPack = await GET_HISTORY(
      new Request('http://localhost/api/history', {
        headers: { cookie: userCookie },
      }),
    );
    expect(historyCurrentPack.status).toBe(200);
    expect((await historyCurrentPack.json()).data.items).toHaveLength(0);

    const historyAllPacks = await GET_HISTORY(
      new Request('http://localhost/api/history?packScope=all', {
        headers: { cookie: userCookie },
      }),
    );
    expect(historyAllPacks.status).toBe(200);
    expect((await historyAllPacks.json()).data.items).toHaveLength(1);

    const summaryCurrentPack = await GET_HISTORY_SUMMARY(
      new Request('http://localhost/api/history/summary', {
        headers: { cookie: userCookie },
      }),
    );
    expect(summaryCurrentPack.status).toBe(200);
    expect((await summaryCurrentPack.json()).data.countsByStatus.WATCHED).toBe(0);

    const summaryAllPacks = await GET_HISTORY_SUMMARY(
      new Request('http://localhost/api/history/summary?packScope=all', {
        headers: { cookie: userCookie },
      }),
    );
    expect(summaryAllPacks.status).toBe(200);
    expect((await summaryAllPacks.json()).data.countsByStatus.WATCHED).toBe(1);
  });
});
