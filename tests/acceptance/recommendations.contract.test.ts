import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAcceptancePrisma,
  resetAcceptanceDatabase,
  seedRecommendationAcceptance,
  setupAcceptanceDatabase,
} from './utils/recommendations-seed';
import { zMovieCardVM } from '@/contracts/movieCardVM';
import { makeSessionCookie } from '../helpers/session-cookie';

const acceptanceSchemaName = 'recommendations_contract_acceptance_test';
const acceptancePrisma = createAcceptancePrisma(acceptanceSchemaName);

vi.mock('@/lib/prisma', () => ({
  prisma: acceptancePrisma,
}));

const { POST } = await import('@/app/api/recommendations/next/route');
const { GET: GET_DIAGNOSTICS } = await import('@/app/api/recommendations/[batchId]/diagnostics/route');

beforeAll(() => {
  setupAcceptanceDatabase(acceptanceSchemaName);
});

  beforeEach(async () => {
    delete process.env.REC_ENGINE_MODE;
    await resetAcceptanceDatabase(acceptancePrisma);
  });

describe('recommendations contract acceptance', () => {
  it('returns 200, exactly 5 unique cards, and all cards validate against MovieCardVM', async () => {
    const { userAId } = await seedRecommendationAcceptance(acceptancePrisma);

    const request = new Request('http://localhost/api/recommendations/next', {
      method: 'POST',
      headers: {
        cookie: makeSessionCookie(userAId),
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

      const streaming = (card as { streaming: { region?: string; offers?: unknown[] } }).streaming;
      expect(typeof streaming.region).toBe('string');
      expect(streaming.region).toBe('US');
      expect(Array.isArray(streaming.offers)).toBe(true);

      const reception = (card as { reception?: { critics?: unknown; audience?: unknown; summary?: unknown } }).reception;
      expect(reception).toBeDefined();
      const hasCriticsOrAudience = Boolean(reception?.critics || reception?.audience);
      if (!hasCriticsOrAudience) {
        expect(reception?.summary).toBe('Reception data currently unavailable.');
      } else {
        expect(typeof reception?.summary === 'string' || reception?.summary === undefined).toBe(true);
      }
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
          cookie: makeSessionCookie(userAId),
        },
      }),
    );

    const forUserB = await POST(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          cookie: makeSessionCookie(userBId),
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

  it('modern mode creates diagnostics and endpoint returns them', async () => {
    process.env.REC_ENGINE_MODE = 'modern';
    const { userAId } = await seedRecommendationAcceptance(acceptancePrisma);

    const recResponse = await POST(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          cookie: makeSessionCookie(userAId),
        },
      }),
    );

    expect(recResponse.status).toBe(200);
    const recBody = await recResponse.json();
    const batchId = recBody.data.batchId as string;

    const diagnosticsInDb = await acceptancePrisma.recommendationDiagnostics.findUnique({ where: { batchId } });
    expect(diagnosticsInDb).not.toBeNull();
    expect(typeof diagnosticsInDb?.candidateCount).toBe('number');
    expect(typeof diagnosticsInDb?.excludedSeenCount).toBe('number');
    expect(typeof diagnosticsInDb?.excludedSkippedRecentCount).toBe('number');
    expect(typeof diagnosticsInDb?.explorationUsed).toBe('boolean');
    expect(diagnosticsInDb?.diversityStats).not.toBeNull();

    const diagnosticsResponse = await GET_DIAGNOSTICS(
      new Request(`http://localhost/api/recommendations/${batchId}/diagnostics`, {
        headers: {
          cookie: makeSessionCookie(userAId, true),
        },
      }),
      { params: { batchId } },
    );

    expect(diagnosticsResponse.status).toBe(200);
    const diagnosticsBody = await diagnosticsResponse.json();
    expect(diagnosticsBody.error).toBeNull();
    expect(diagnosticsBody.data.batchId).toBe(batchId);
    expect(typeof diagnosticsBody.data.candidateCount).toBe('number');
    expect(typeof diagnosticsBody.data.excludedSeenCount).toBe('number');
    expect(typeof diagnosticsBody.data.excludedSkippedRecentCount).toBe('number');
    expect(typeof diagnosticsBody.data.explorationUsed).toBe('boolean');
    expect(typeof diagnosticsBody.data.diversityStats).toBe('object');
  });
});
