import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/curriculum/tmdb-search/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const { userFindUniqueMock } = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
  },
}));

describe('/api/admin/curriculum/tmdb-search', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    vi.unstubAllGlobals();
    process.env.TMDB_API_KEY = 'test-key';
  });

  it('blocks non-admin access', async () => {
    const response = await GET(new Request('http://localhost/api/admin/curriculum/tmdb-search?q=alien', {
      headers: {
        cookie: makeSessionCookie('user_1', false),
      },
    }));
    expect(response.status).toBe(403);
  });

  it('returns normalized tmdb search results for admin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 348,
            title: 'Alien',
            release_date: '1979-05-25',
            poster_path: '/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg',
            overview: 'A crew discovers a deadly life-form.',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new Request('http://localhost/api/admin/curriculum/tmdb-search?q=alien&limit=5', {
      headers: {
        cookie: makeSessionCookie('admin_1', true),
      },
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toEqual([
      {
        tmdbId: 348,
        title: 'Alien',
        year: 1979,
        posterUrl: 'https://image.tmdb.org/t/p/w500/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg',
        overview: 'A crew discovers a deadly life-form.',
      },
    ]);
  });
});

