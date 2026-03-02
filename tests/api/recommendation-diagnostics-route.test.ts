import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/recommendations/[batchId]/diagnostics/route';

const findUniqueMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recommendationDiagnostics: { findUnique: findUniqueMock },
  },
}));

describe('GET /api/recommendations/[batchId]/diagnostics', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    findUniqueMock.mockReset();
  });

  it('returns 401 when admin token is missing', async () => {
    const request = new Request('http://localhost/api/recommendations/batch_1/diagnostics');
    const response = await GET(request, { params: { batchId: 'batch_1' } });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' },
    });
  });

  it('returns 404 when diagnostics are not found', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const response = await GET(
      new Request('http://localhost/api/recommendations/batch_1/diagnostics', {
        headers: { 'x-admin-token': 'test-admin-token' },
      }),
      { params: { batchId: 'batch_1' } },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { code: 'NOT_FOUND', message: 'Recommendation diagnostics not found' },
    });
  });

  it('returns diagnostics payload when present', async () => {
    findUniqueMock.mockResolvedValueOnce({
      batchId: 'batch_1',
      candidateCount: 8,
      excludedSeenCount: 1,
      excludedSkippedRecentCount: 0,
      explorationUsed: false,
      diversityStats: { candidatePool: 8, selectedCount: 5 },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await GET(
      new Request('http://localhost/api/recommendations/batch_1/diagnostics', {
        headers: { 'x-admin-token': 'test-admin-token' },
      }),
      { params: { batchId: 'batch_1' } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data.batchId).toBe('batch_1');
    expect(body.data.candidateCount).toBe(8);
    expect(body.data.explorationUsed).toBe(false);
    expect(body.data.diversityStats).toEqual({ candidatePool: 8, selectedCount: 5 });
  });
});
