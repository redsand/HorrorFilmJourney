import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/history/summary/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const { userFindUniqueMock, userProfileFindUniqueMock, historyFindManyMock } = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  userProfileFindUniqueMock: vi.fn(),
  historyFindManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    userProfile: { findUnique: userProfileFindUniqueMock },
    userMovieInteraction: { findMany: historyFindManyMock },
  },
}));

describe('GET /api/history/summary', () => {
  beforeEach(() => {
    process.env.SEASONS_PACKS_ENABLED = 'false';
    userFindUniqueMock.mockReset();
    userProfileFindUniqueMock.mockReset();
    historyFindManyMock.mockReset();
  });

  it('computes status counts, average rating, era preferences, and top tags', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    historyFindManyMock.mockResolvedValue([
      {
        id: 'i1',
        status: 'WATCHED',
        rating: 4,
        emotions: ['dread', 'tense'],
        workedBest: ['pacing'],
        movie: { year: 1999 },
      },
      {
        id: 'i2',
        status: 'ALREADY_SEEN',
        rating: 2,
        emotions: ['dread'],
        workedBest: ['performances', 'pacing'],
        movie: { year: 2003 },
      },
      {
        id: 'i3',
        status: 'SKIPPED',
        rating: null,
        emotions: ['slow-burn'],
        workedBest: [],
        movie: { year: 2001 },
      },
      {
        id: 'i4',
        status: 'WANT_TO_WATCH',
        rating: null,
        emotions: null,
        workedBest: null,
        movie: { year: null },
      },
    ]);

    const request = new Request('http://localhost/api/history/summary', {
      headers: {
        cookie: makeSessionCookie('user_1'),
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.error).toBeNull();
    expect(payload.data.countsByStatus).toEqual({
      WATCHED: 1,
      ALREADY_SEEN: 1,
      SKIPPED: 1,
      WANT_TO_WATCH: 1,
    });
    expect(payload.data.avgRatingWatchedOrAlreadySeen).toBe(3);
    expect(payload.data.eraPreferences).toEqual({
      '1990s': 1,
      '2000s': 2,
    });
    expect(payload.data.topTags).toEqual([
      { tag: 'dread', count: 2 },
      { tag: 'pacing', count: 2 },
      { tag: 'performances', count: 1 },
      { tag: 'slow-burn', count: 1 },
      { tag: 'tense', count: 1 },
    ]);
  });

  it('applies user scoping in summary query', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    historyFindManyMock.mockResolvedValue([]);

    const request = new Request('http://localhost/api/history/summary', {
      headers: {
        cookie: makeSessionCookie('user_1'),
      },
    });

    await GET(request);

    expect(historyFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1' },
      }),
    );
  });

  it('returns 400 for invalid packScope', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    const request = new Request('http://localhost/api/history/summary?packScope=invalid', {
      headers: { cookie: makeSessionCookie('user_1') },
    });

    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('scopes summary to selected pack when seasons/packs is enabled', async () => {
    process.env.SEASONS_PACKS_ENABLED = 'true';
    userFindUniqueMock.mockResolvedValue({ id: 'user_1' });
    userProfileFindUniqueMock.mockResolvedValue({ selectedPackId: 'pack_horror' });
    historyFindManyMock.mockResolvedValue([]);

    const request = new Request('http://localhost/api/history/summary', {
      headers: { cookie: makeSessionCookie('user_1') },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(historyFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user_1',
          recommendationItem: {
            batch: {
              packId: 'pack_horror',
            },
          },
        },
      }),
    );
  });
});
