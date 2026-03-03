import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/admin/curriculum/external-links/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  externalReadingFindManyMock,
  externalReadingUpsertMock,
  auditEventCreateMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  externalReadingFindManyMock: vi.fn(),
  externalReadingUpsertMock: vi.fn(),
  auditEventCreateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    externalReadingCuration: {
      findMany: externalReadingFindManyMock,
      upsert: externalReadingUpsertMock,
    },
    auditEvent: {
      create: auditEventCreateMock,
    },
  },
}));

describe('admin external links route', () => {
  type SavedLink = {
    id: string;
    movieId: string;
    seasonId: string;
    sourceName: string;
    articleTitle: string;
    url: string;
    sourceType: 'REVIEW' | 'ESSAY' | 'RETROSPECTIVE';
    publicationDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  let store: SavedLink[] = [];

  beforeEach(() => {
    store = [];
    userFindUniqueMock.mockReset();
    externalReadingFindManyMock.mockReset();
    externalReadingUpsertMock.mockReset();
    auditEventCreateMock.mockReset();

    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    auditEventCreateMock.mockResolvedValue({});
    externalReadingFindManyMock.mockImplementation(async (args: { where: { movieId: string; seasonId: string } }) => (
      store.filter((row) => row.movieId === args.where.movieId && row.seasonId === args.where.seasonId)
    ));
    externalReadingUpsertMock.mockImplementation(async (args: {
      where: { movieId_seasonId_url: { movieId: string; seasonId: string; url: string } };
      create: {
        movieId: string;
        seasonId: string;
        sourceName: string;
        articleTitle: string;
        url: string;
        sourceType: 'REVIEW' | 'ESSAY' | 'RETROSPECTIVE';
        publicationDate: Date | null;
      };
      update: {
        sourceName: string;
        articleTitle: string;
        sourceType: 'REVIEW' | 'ESSAY' | 'RETROSPECTIVE';
        publicationDate: Date | null;
      };
    }) => {
      const key = args.where.movieId_seasonId_url;
      const existing = store.find((row) => row.movieId === key.movieId && row.seasonId === key.seasonId && row.url === key.url);
      if (existing) {
        existing.sourceName = args.update.sourceName;
        existing.articleTitle = args.update.articleTitle;
        existing.sourceType = args.update.sourceType;
        existing.publicationDate = args.update.publicationDate;
        existing.updatedAt = new Date();
        return existing;
      }
      const created: SavedLink = {
        id: `link_${store.length + 1}`,
        movieId: args.create.movieId,
        seasonId: args.create.seasonId,
        sourceName: args.create.sourceName,
        articleTitle: args.create.articleTitle,
        url: args.create.url,
        sourceType: args.create.sourceType,
        publicationDate: args.create.publicationDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.push(created);
      return created;
    });
  });

  it('enforces season allowlist domain validation', async () => {
    const response = await POST(new Request('http://localhost/api/admin/curriculum/external-links', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('admin_1', true),
      },
      body: JSON.stringify({
        movieId: 'movie_1',
        seasonId: 'season-1',
        sourceName: 'Bloody Disgusting',
        articleTitle: 'Bad domain sample',
        url: 'https://example.com/not-allowed',
        sourceType: 'review',
      }),
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('supports save/load roundtrip for curated external links', async () => {
    const saveResponse = await POST(new Request('http://localhost/api/admin/curriculum/external-links', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: makeSessionCookie('admin_1', true),
      },
      body: JSON.stringify({
        movieId: 'movie_1',
        seasonId: 'season-1',
        sourceName: 'Bloody Disgusting',
        articleTitle: 'The Dark (2005) Revisited',
        url: 'https://bloody-disgusting.com/editorials/example',
        sourceType: 'retrospective',
      }),
    }));
    expect(saveResponse.status).toBe(200);

    const loadResponse = await GET(new Request('http://localhost/api/admin/curriculum/external-links?movieId=movie_1&seasonId=season-1', {
      method: 'GET',
      headers: {
        cookie: makeSessionCookie('admin_1', true),
      },
    }));
    expect(loadResponse.status).toBe(200);
    const body = await loadResponse.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      sourceName: 'Bloody Disgusting',
      articleTitle: 'The Dark (2005) Revisited',
      url: 'https://bloody-disgusting.com/editorials/example',
      sourceType: 'retrospective',
      seasonId: 'season-1',
    });
    expect(auditEventCreateMock).toHaveBeenCalled();
  });
});

