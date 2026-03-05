import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/retrieval/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  retrievalRunFindManyMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  retrievalRunFindManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    retrievalRun: { findMany: retrievalRunFindManyMock },
  },
}));

describe('GET /api/admin/retrieval', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    retrievalRunFindManyMock.mockReset();
  });

  it('blocks non-admin users', async () => {
    const response = await GET(new Request('http://localhost/api/admin/retrieval', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    }));
    expect(response.status).toBe(403);
  });

  it('returns retrieval diagnostics for admin', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    retrievalRunFindManyMock.mockResolvedValue([
      {
        id: 'run_1',
        movieId: 'movie_1',
        mode: 'hybrid',
        fallbackUsed: false,
        fallbackReason: null,
        seasonSlug: 'season-2',
        packId: 'pack_cult',
        queryText: 'cult reception',
        candidateCount: 12,
        selectedCount: 5,
        latencyMs: 18,
        createdAt: new Date('2026-03-04T12:00:00.000Z'),
      },
    ]);

    const response = await GET(new Request('http://localhost/api/admin/retrieval', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error).toBeNull();
    expect(body.data.runs).toHaveLength(1);
    expect(body.data.runs[0]).toEqual(expect.objectContaining({
      id: 'run_1',
      movieId: 'movie_1',
      mode: 'hybrid',
      seasonSlug: 'season-2',
      packId: 'pack_cult',
      candidateCount: 12,
      selectedCount: 5,
    }));
    expect(body.data.gates).toEqual(expect.objectContaining({
      pass: true,
    }));
  });

  it('reports failing gates when retrieval health is degraded', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    retrievalRunFindManyMock.mockResolvedValue([
      {
        id: 'run_bad_1',
        movieId: 'movie_1',
        mode: 'hybrid',
        fallbackUsed: true,
        fallbackReason: 'hybrid-error',
        seasonSlug: 'season-2',
        packId: 'pack_cult',
        queryText: 'cult reception',
        candidateCount: 0,
        selectedCount: 0,
        latencyMs: 999,
        createdAt: new Date('2026-03-04T12:00:00.000Z'),
      },
      {
        id: 'run_bad_2',
        movieId: 'movie_2',
        mode: 'hybrid',
        fallbackUsed: true,
        fallbackReason: 'hybrid-error',
        seasonSlug: 'season-2',
        packId: 'pack_cult',
        queryText: 'cult reception',
        candidateCount: 0,
        selectedCount: 0,
        latencyMs: 800,
        createdAt: new Date('2026-03-04T12:00:01.000Z'),
      },
    ]);

    const response = await GET(new Request('http://localhost/api/admin/retrieval', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.gates.pass).toBe(false);
    expect(body.data.gates.failed.some((entry: { metric: string }) => entry.metric === 'emptyHitRate')).toBe(true);
    expect(body.data.gates.failed.some((entry: { metric: string }) => entry.metric === 'fallbackRate')).toBe(true);
    expect(body.data.gates.failed.some((entry: { metric: string }) => entry.metric === 'p95LatencyMs')).toBe(true);
  });
});
