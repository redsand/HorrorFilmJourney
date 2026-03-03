import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/admin/curriculum/node-movies/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  journeyNodeFindUniqueMock,
  movieFindUniqueMock,
  movieUpsertMock,
  movieRatingUpsertMock,
  nodeMovieCreateMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  journeyNodeFindUniqueMock: vi.fn(),
  movieFindUniqueMock: vi.fn(),
  movieUpsertMock: vi.fn(),
  movieRatingUpsertMock: vi.fn(),
  nodeMovieCreateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
    },
    journeyNode: {
      findUnique: journeyNodeFindUniqueMock,
    },
    movie: {
      findUnique: movieFindUniqueMock,
      upsert: movieUpsertMock,
    },
    movieRating: {
      upsert: movieRatingUpsertMock,
    },
    nodeMovie: {
      create: nodeMovieCreateMock,
    },
  },
}));

describe('/api/admin/curriculum/node-movies', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    journeyNodeFindUniqueMock.mockReset();
    journeyNodeFindUniqueMock.mockResolvedValue({
      id: 'node_1',
      movies: [{ rank: 4 }],
    });
    movieFindUniqueMock.mockReset();
    movieUpsertMock.mockReset();
    movieRatingUpsertMock.mockReset();
    nodeMovieCreateMock.mockReset();
    nodeMovieCreateMock.mockResolvedValue({
      id: 'assignment_1',
      rank: 5,
      movie: { tmdbId: 4242, title: 'The Keep' },
    });
    vi.unstubAllGlobals();
    process.env.TMDB_API_KEY = 'test-key';
  });

  it('blocks non-admin access', async () => {
    const response = await POST(new Request('http://localhost/api/admin/curriculum/node-movies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('user_1', false),
      },
      body: JSON.stringify({ nodeId: 'node_1', tmdbId: 4242 }),
    }));
    expect(response.status).toBe(403);
  });

  it('assigns an existing local movie to a node', async () => {
    movieFindUniqueMock.mockResolvedValue({
      id: 'movie_1',
      tmdbId: 4242,
      title: 'The Keep',
    });

    const response = await POST(new Request('http://localhost/api/admin/curriculum/node-movies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('admin_1', true),
      },
      body: JSON.stringify({ nodeId: 'node_1', tmdbId: 4242 }),
    }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toMatchObject({
      nodeId: 'node_1',
      tmdbId: 4242,
      title: 'The Keep',
      rank: 5,
    });
    expect(movieUpsertMock).not.toHaveBeenCalled();
    expect(nodeMovieCreateMock).toHaveBeenCalled();
  });

  it('resolves from tmdb and creates movie when local movie is missing', async () => {
    movieFindUniqueMock.mockResolvedValueOnce(null);
    movieUpsertMock.mockResolvedValue({
      id: 'movie_tmdb',
      tmdbId: 4242,
      title: 'The Keep',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 4242,
        title: 'The Keep',
        release_date: '1983-12-16',
        poster_path: '/abc123.jpg',
        vote_average: 6.8,
        genres: [{ name: 'Horror' }, { name: 'Fantasy' }],
        credits: {
          cast: [{ name: 'Scott Glenn', character: 'Glaeken' }],
          crew: [{ job: 'Director', name: 'Michael Mann' }],
        },
      }),
    }));

    const response = await POST(new Request('http://localhost/api/admin/curriculum/node-movies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('admin_1', true),
      },
      body: JSON.stringify({ nodeId: 'node_1', tmdbId: 4242 }),
    }));

    expect(response.status).toBe(201);
    expect(movieUpsertMock).toHaveBeenCalled();
    expect(movieRatingUpsertMock).toHaveBeenCalled();
  });
});

