import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/history/route';

const { userFindUniqueMock, historyFindManyMock } = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  historyFindManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    userMovieInteraction: { findMany: historyFindManyMock },
  },
}));

describe('GET /api/history', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
    userFindUniqueMock.mockReset();
    historyFindManyMock.mockReset();
  });

  it('returns 400 when X-User-Id is missing', async () => {
    const request = new Request('http://localhost/api/history', {
      headers: { 'x-admin-token': 'test-admin-token' },
    });

    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns user-scoped history only', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    historyFindManyMock.mockImplementation(async ({ where }: { where: { userId: string } }) => {
      if (where.userId === 'user_1') {
        return [
          {
            id: 'i2',
            status: 'WATCHED',
            rating: 4,
            createdAt: new Date('2025-01-02T00:00:00.000Z'),
            movie: { tmdbId: 2, title: 'Movie 2', year: 2002, posterUrl: null },
          },
          {
            id: 'i1',
            status: 'SKIPPED',
            rating: null,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            movie: { tmdbId: 1, title: 'Movie 1', year: 2001, posterUrl: null },
          },
        ];
      }
      return [
        {
          id: 'other',
          status: 'WATCHED',
          rating: 5,
          createdAt: new Date('2025-01-03T00:00:00.000Z'),
          movie: { tmdbId: 999, title: 'Other User Movie', year: 2010, posterUrl: null },
        },
      ];
    });

    const request = new Request('http://localhost/api/history?limit=10', {
      headers: {
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.error).toBeNull();
    expect(payload.data.items).toHaveLength(2);
    expect(payload.data.items[0].interactionId).toBe('i2');
    expect(payload.data.items.some((item: { interactionId: string }) => item.interactionId === 'other')).toBe(false);
    expect(payload.data.pageInfo.nextCursor).toBeUndefined();
  });

  it('returns mapped item shape and next cursor when page is full', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    historyFindManyMock.mockResolvedValue([
      {
        id: 'i3',
        status: 'WATCHED',
        rating: 5,
        createdAt: new Date('2025-01-03T00:00:00.000Z'),
        emotions: ['tense'],
        intensity: 4,
        agedWell: 'yes',
        movie: { tmdbId: 3, title: 'Movie 3', year: 2003, posterUrl: null },
      },
      {
        id: 'i2',
        status: 'SKIPPED',
        rating: null,
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
        emotions: [],
        intensity: null,
        agedWell: null,
        movie: { tmdbId: 2, title: 'Movie 2', year: 2002, posterUrl: null },
      },
    ]);

    const request = new Request('http://localhost/api/history?limit=2', {
      headers: {
        'x-admin-token': 'test-admin-token',
        'x-user-id': 'user_1',
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.data.items[0]).toEqual({
      interactionId: 'i3',
      status: 'WATCHED',
      rating: 5,
      createdAt: '2025-01-03T00:00:00.000Z',
      tags: { emotions: ['tense'], intensity: 4, agedWell: 'yes' },
      movie: { tmdbId: 3, title: 'Movie 3', year: 2003, posterUrl: null },
    });
    expect(payload.data.pageInfo.nextCursor).toBe('i2');
  });
});
