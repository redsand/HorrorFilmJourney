import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';
import { makeSessionCookie } from '../helpers/session-cookie';

const testDbUrl = buildTestDatabaseUrl('evidence_upsert_and_recommendations_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

vi.mock('@/lib/prisma', () => ({
  prisma,
}));

const evidenceRoute = await import('@/app/api/evidence/upsert/route');
const recommendationsRoute = await import('@/app/api/recommendations/next/route');

async function seedMovies(): Promise<{ userId: string; targetTmdbId: number }> {
  const user = await prisma.user.create({ data: { displayName: 'Evidence User' } });
  const tmdbIds = [901, 902, 903, 904, 905];

  for (const tmdbId of tmdbIds) {
    const movie = await prisma.movie.create({
      data: {
        tmdbId,
        title: `Evidence Movie ${tmdbId}`,
        year: 2000,
        posterUrl: `https://img/${tmdbId}.jpg`,
        genres: ['horror'],
      },
    });

    await prisma.movieRating.createMany({
      data: [
        { movieId: movie.id, source: 'IMDB', value: 7.1, scale: '10', rawValue: '7.1/10' },
        { movieId: movie.id, source: 'ROTTEN_TOMATOES', value: 80, scale: '100', rawValue: '80%' },
        { movieId: movie.id, source: 'METACRITIC', value: 75, scale: '100', rawValue: '75/100' },
      ],
    });
  }

  return { userId: user.id, targetTmdbId: 901 };
}

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  delete process.env.REC_ENGINE_MODE;

  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movieEmbedding.deleteMany();
  await prisma.userEmbeddingSnapshot.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();
});

describe('evidence upsert + recommendations evidence propagation', () => {
  it('dedupes evidence upserts by movie/source/url/snippet hash', async () => {
    const { userId, targetTmdbId } = await seedMovies();

    const reqInit = {
      method: 'POST',
      headers: {
        cookie: makeSessionCookie(userId, true),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tmdbId: targetTmdbId,
        sourceName: 'Wikipedia',
        url: 'https://example.com/wiki',
        snippet: 'Evidence snippet text',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      }),
    } satisfies RequestInit;

    const first = await evidenceRoute.POST(new Request('http://localhost/api/evidence/upsert', reqInit));
    const second = await evidenceRoute.POST(new Request('http://localhost/api/evidence/upsert', reqInit));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const count = await prisma.evidencePacket.count();
    expect(count).toBe(1);
  });

  it('includes stored evidence in MovieCardVM.evidence when movie is recommended', async () => {
    const { userId, targetTmdbId } = await seedMovies();

    await evidenceRoute.POST(
      new Request('http://localhost/api/evidence/upsert', {
        method: 'POST',
        headers: {
          cookie: makeSessionCookie(userId, true),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tmdbId: targetTmdbId,
          sourceName: 'Wikipedia',
          url: 'https://example.com/wiki',
          snippet: 'Evidence snippet text',
          retrievedAt: '2026-01-01T00:00:00.000Z',
        }),
      }),
    );

    const response = await recommendationsRoute.POST(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          cookie: makeSessionCookie(userId),
        },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    const targetCard = (body.data.cards as Array<{
      movie: { tmdbId: number };
      evidence: Array<{
        sourceName: string;
        snippet: string;
        provenance?: { retrievalMode: 'cache' | 'hybrid'; sourceType: 'packet' | 'external_reading' | 'chunk' };
      }>;
    }>).find(
      (card) => card.movie.tmdbId === targetTmdbId,
    );

    expect(targetCard).toBeDefined();
    expect(Array.isArray(targetCard?.evidence)).toBe(true);
    expect(targetCard?.evidence[0]?.sourceName).toBe('Wikipedia');
    expect(targetCard?.evidence[0]?.snippet).toBe('Evidence snippet text');
    expect(targetCard?.evidence[0]?.provenance).toEqual({
      retrievalMode: 'cache',
      sourceType: 'packet',
    });
  });
});
