import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/system/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  appErrorFindManyMock,
  feedbackFindManyMock,
  auditFindManyMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  appErrorFindManyMock: vi.fn(),
  feedbackFindManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    appErrorLog: { findMany: appErrorFindManyMock },
    feedback: { findMany: feedbackFindManyMock },
    auditEvent: { findMany: auditFindManyMock },
  },
}));

describe('GET /api/admin/system', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    appErrorFindManyMock.mockReset();
    feedbackFindManyMock.mockReset();
    auditFindManyMock.mockReset();
  });

  it('blocks non-admin users', async () => {
    const response = await GET(new Request('http://localhost/api/admin/system', {
      headers: { cookie: makeSessionCookie('user_1', false) },
    }));
    expect(response.status).toBe(403);
  });

  it('returns operational payload for admin', async () => {
    userFindUniqueMock.mockResolvedValue({ id: 'admin_1' });
    appErrorFindManyMock.mockResolvedValue([]);
    feedbackFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);

    const response = await GET(new Request('http://localhost/api/admin/system', {
      headers: { cookie: makeSessionCookie('admin_1', true) },
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toEqual({
      errors: [],
      feedback: [],
      jobs: [],
      audits: [],
    });
  });
});
