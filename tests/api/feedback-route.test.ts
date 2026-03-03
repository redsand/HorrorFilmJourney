import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/feedback/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const { userFindUniqueMock, feedbackCreateMock, batchFindFirstMock } = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  feedbackCreateMock: vi.fn(),
  batchFindFirstMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
    feedback: {
      create: feedbackCreateMock,
    },
    recommendationBatch: {
      findFirst: batchFindFirstMock,
    },
  },
}));

describe('/api/feedback POST route', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    feedbackCreateMock.mockReset();
    batchFindFirstMock.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'BUG',
        title: 'Poster missing',
        description: 'Posters fail to load on journey cards.',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('allows authenticated user to submit feedback', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    batchFindFirstMock.mockResolvedValueOnce({ id: 'batch_1', journeyNode: 'ENGINE_MODERN_CORE' });
    feedbackCreateMock.mockResolvedValueOnce({ id: 'fb_1' });

    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1', false),
        'user-agent': 'Vitest Agent',
      },
      body: JSON.stringify({
        type: 'BUG',
        category: 'UX',
        title: 'Poster cards are blank',
        description: 'On Journey, poster image fails to render for all five cards.',
        route: '/journey',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(feedbackCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          type: 'BUG',
          category: 'UX',
          title: 'Poster cards are blank',
          route: '/journey',
          userAgent: 'Vitest Agent',
          metadata: {
            journeyNode: 'ENGINE_MODERN_CORE',
            lastRecommendationBatchId: 'batch_1',
            inCompanionMode: false,
            spoilerPolicy: null,
          },
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      data: { id: 'fb_1' },
      error: null,
    });
  });

  it('returns 400 for invalid payload', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1', false),
      },
      body: JSON.stringify({
        type: 'BUG',
        title: 'Bad',
        description: 'short',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('stores safe companion metadata and ignores sensitive input fields', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    batchFindFirstMock.mockResolvedValueOnce({ id: 'batch_9', journeyNode: 'NODE_X' });
    feedbackCreateMock.mockResolvedValueOnce({ id: 'fb_9' });
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1', false),
        'user-agent': 'Vitest Agent',
      },
      body: JSON.stringify({
        type: 'CONFUSION',
        title: 'Companion seemed vague',
        description: 'Companion did not clarify spoiler tiers in this view.',
        route: '/companion/17?spoilerPolicy=FULL',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(feedbackCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: {
          journeyNode: 'NODE_X',
          lastRecommendationBatchId: 'batch_9',
          inCompanionMode: true,
          spoilerPolicy: 'FULL',
        },
      }),
    }));
  });

  it('rejects sensitive unknown fields and does not persist feedback', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    const request = new Request('http://localhost/api/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1', false),
      },
      body: JSON.stringify({
        type: 'CONFUSION',
        title: 'Companion seemed vague',
        description: 'Companion did not clarify spoiler tiers in this view.',
        password: 'should-not-store',
        sessionToken: 'should-not-store',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(feedbackCreateMock).not.toHaveBeenCalled();
  });
});
