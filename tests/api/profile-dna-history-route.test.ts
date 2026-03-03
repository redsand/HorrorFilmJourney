import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/profile/dna/history/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  tasteSnapshotFindManyMock,
  interactionCountMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  tasteSnapshotFindManyMock: vi.fn(),
  interactionCountMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
    tasteSnapshot: { findMany: tasteSnapshotFindManyMock },
    userMovieInteraction: { count: interactionCountMock },
  },
}));

describe('GET /api/profile/dna/history', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    tasteSnapshotFindManyMock.mockReset();
    interactionCountMock.mockReset();
  });

  it('returns timeline and evolution narrative', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    tasteSnapshotFindManyMock.mockResolvedValueOnce([
      {
        takenAt: new Date('2026-03-01T00:00:00.000Z'),
        intensityPreference: 0.4,
        pacingPreference: 0.6,
        psychologicalVsSupernatural: 0.35,
        goreTolerance: 0.4,
        ambiguityTolerance: 0.45,
        nostalgiaBias: 0.5,
        auteurAffinity: 0.5,
      },
      {
        takenAt: new Date('2026-03-10T00:00:00.000Z'),
        intensityPreference: 0.42,
        pacingPreference: 0.55,
        psychologicalVsSupernatural: 0.72,
        goreTolerance: 0.38,
        ambiguityTolerance: 0.52,
        nostalgiaBias: 0.5,
        auteurAffinity: 0.54,
      },
    ]);
    interactionCountMock.mockResolvedValueOnce(6);

    const response = await GET(new Request('http://localhost/api/profile/dna/history', {
      headers: { cookie: makeSessionCookie('user_1') },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.snapshots).toHaveLength(2);
    expect(body.data.evolutionNarrative).toContain('psychological themes');
    expect(body.data.evolutionNarrative).toContain('6 films');
  });
});
