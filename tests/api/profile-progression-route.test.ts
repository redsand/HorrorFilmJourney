import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/profile/progression/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  getProfileProgressMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  getProfileProgressMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
  },
}));

vi.mock('@/lib/journey/journey-progression-service', () => ({
  JourneyProgressionService: class {
    getProfileProgress(userId: string) {
      return getProfileProgressMock(userId);
    }
  },
}));

describe('GET /api/profile/progression', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    getProfileProgressMock.mockReset();
  });

  it('returns progression for authenticated user', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    getProfileProgressMock.mockResolvedValueOnce({
      currentNode: 'ENGINE_V1_CORE#RANK_2',
      masteryScore: 1.66,
      completedCount: 3,
      nextMilestone: 5,
      unlockedThemes: ['ENGINE_V1_CORE#RANK_1'],
    });

    const response = await GET(new Request('http://localhost/api/profile/progression', {
      headers: { cookie: makeSessionCookie('user_1') },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getProfileProgressMock).toHaveBeenCalledWith('user_1');
    expect(body.data.currentNode).toBe('ENGINE_V1_CORE#RANK_2');
    expect(body.data.nextMilestone).toBe(5);
  });
});
