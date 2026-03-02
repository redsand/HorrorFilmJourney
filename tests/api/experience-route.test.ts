import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/experience/route';

const { userFindUniqueMock, getExperienceMock } = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  getExperienceMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
  },
}));

vi.mock('@/lib/experience-state', () => ({
  getExperience: (...args: unknown[]) => getExperienceMock(...args),
}));

describe('GET /api/experience', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    userFindUniqueMock.mockReset();
    getExperienceMock.mockReset();
  });

  it('returns 401 when admin token is missing', async () => {
    const request = new Request('http://localhost/api/experience');
    const response = await GET(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' },
    });
  });

  it('returns 400 when X-User-Id is missing', async () => {
    const request = new Request('http://localhost/api/experience', {
      headers: { 'x-admin-token': 'test-admin-token' },
    });
    const response = await GET(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' },
    });
  });

  it('returns state payload envelope', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    getExperienceMock.mockResolvedValueOnce({ state: 'SHOW_RECOMMENDATION_BUNDLE', bundle: { id: 'b1', createdAt: '2025-01-01T00:00:00.000Z', cards: [] } });

    const request = new Request('http://localhost/api/experience', {
      headers: {
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        state: 'SHOW_RECOMMENDATION_BUNDLE',
        bundle: { id: 'b1', createdAt: '2025-01-01T00:00:00.000Z', cards: [] },
      },
      error: null,
    });
  });
});
