import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/profile/insights/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  interactionFindManyMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  interactionFindManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    userMovieInteraction: { findMany: interactionFindManyMock },
  },
}));

vi.mock('@/lib/packs/pack-resolver', () => ({
  resolveEffectivePackForUser: vi.fn(async () => ({ packId: 'pack_horror', packSlug: 'horror', seasonSlug: 'season-1', primaryGenre: 'horror' })),
}));

describe('GET /api/profile/insights', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    interactionFindManyMock.mockReset();
  });

  it('returns generated insights when enough data exists', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    interactionFindManyMock.mockResolvedValueOnce([
      { status: 'WATCHED', rating: 5, intensity: 2, movie: { year: 1984, genres: ['horror', 'psychological'] } },
      { status: 'WATCHED', rating: 5, intensity: 2, movie: { year: 1986, genres: ['horror', 'psychological'] } },
      { status: 'ALREADY_SEEN', rating: 4, intensity: 3, movie: { year: 1988, genres: ['horror', 'psychological'] } },
      { status: 'WATCHED', rating: 2, intensity: 5, movie: { year: 2012, genres: ['horror', 'slasher'] } },
      { status: 'WATCHED', rating: 2, intensity: 5, movie: { year: 2014, genres: ['horror', 'slasher'] } },
      { status: 'ALREADY_SEEN', rating: 3, intensity: 4, movie: { year: 2016, genres: ['horror', 'slasher'] } },
      { status: 'WATCHED', rating: 4, intensity: 2, movie: { year: 1982, genres: ['horror', 'psychological'] } },
      { status: 'WATCHED', rating: 2, intensity: 5, movie: { year: 2018, genres: ['horror', 'slasher'] } },
    ]);

    const response = await GET(new Request('http://localhost/api/profile/insights', {
      headers: { cookie: makeSessionCookie('user_1') },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.totalRated).toBe(8);
    expect(Array.isArray(body.data.insights)).toBe(true);
    expect(body.data.insights.length).toBeGreaterThan(0);
  });
});
