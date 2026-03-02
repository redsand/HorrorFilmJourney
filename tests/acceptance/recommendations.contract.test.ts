import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAcceptancePrisma,
  resetAcceptanceDatabase,
  seedRecommendationAcceptance,
  setupAcceptanceDatabase,
} from './utils/recommendations-seed';
import { zMovieCardVM } from '@/contracts/movieCardVM';

const acceptancePrisma = createAcceptancePrisma();

vi.mock('@/lib/prisma', () => ({
  prisma: acceptancePrisma,
}));

const { POST } = await import('@/app/api/recommendations/next/route');

beforeAll(() => {
  setupAcceptanceDatabase();
});

beforeEach(async () => {
  process.env.ADMIN_TOKEN = 'acceptance-admin-token';
  delete process.env.REC_ENGINE_MODE;
  await resetAcceptanceDatabase(acceptancePrisma);
});

describe('recommendations contract acceptance', () => {
  it('returns 200, exactly 5 unique cards, and all cards validate against MovieCardVM', async () => {
    const { userAId } = await seedRecommendationAcceptance(acceptancePrisma);

    const request = new Request('http://localhost/api/recommendations/next', {
      method: 'POST',
      headers: {
        'x-admin-token': 'acceptance-admin-token',
        'x-user-id': userAId,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data.cards)).toBe(true);
    expect(body.data.cards).toHaveLength(5);

    for (const card of body.data.cards as unknown[]) {
      const parsed = zMovieCardVM.safeParse(card);
      expect(parsed.success).toBe(true);
    }

    const uniqueTmdbIds = new Set(
      (body.data.cards as Array<{ movie: { tmdbId: number } }>).map((card) => card.movie.tmdbId),
    );
    expect(uniqueTmdbIds.size).toBe(5);
  });

  it('scopes watched history per user (userA exclusions do not affect userB)', async () => {
    const { userAId, userBId } = await seedRecommendationAcceptance(acceptancePrisma);

    const forUserA = await POST(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userAId,
        },
      }),
    );

    const forUserB = await POST(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userBId,
        },
      }),
    );

    const bodyA = await forUserA.json();
    const bodyB = await forUserB.json();

    const userATmdbIds = new Set(
      (bodyA.data.cards as Array<{ movie: { tmdbId: number } }>).map((card) => card.movie.tmdbId),
    );
    const userBTmdbIds = new Set(
      (bodyB.data.cards as Array<{ movie: { tmdbId: number } }>).map((card) => card.movie.tmdbId),
    );

    expect(userATmdbIds.has(801)).toBe(false);
    expect(userATmdbIds.has(802)).toBe(true);

    expect(userBTmdbIds.has(802)).toBe(false);
    expect(userBTmdbIds.has(801)).toBe(true);
  });
});
