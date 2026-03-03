import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/profile/dna/route';
import { makeSessionCookie } from '../helpers/session-cookie';

const {
  userFindUniqueMock,
  computeTasteProfileMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  computeTasteProfileMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock },
  },
}));

vi.mock('@/lib/packs/pack-resolver', () => ({
  resolveEffectivePackForUser: vi.fn(async () => ({ packId: 'pack_horror', packSlug: 'horror', seasonSlug: 'season-1', primaryGenre: 'horror' })),
}));

vi.mock('@/lib/taste/taste-computation-service', () => ({
  TasteComputationService: class {
    computeTasteProfile(userId: string, options?: unknown) {
      return computeTasteProfileMock(userId, options);
    }
  },
  summarizeTasteProfile: (traits: Record<string, unknown>) => `DNA summary for ${Object.keys(traits).length} traits`,
}));

describe('GET /api/profile/dna', () => {
  beforeEach(() => {
    userFindUniqueMock.mockReset();
    computeTasteProfileMock.mockReset();
  });

  it('computes season-scoped DNA profile', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    computeTasteProfileMock.mockResolvedValueOnce({
      intensityPreference: 0.7,
      pacingPreference: 0.4,
      psychologicalVsSupernatural: 0.6,
      goreTolerance: 0.5,
      ambiguityTolerance: 0.55,
      nostalgiaBias: 0.8,
      auteurAffinity: 0.52,
      lastComputedAt: new Date('2026-03-03T00:00:00.000Z'),
    });

    const response = await GET(new Request('http://localhost/api/profile/dna', {
      headers: { cookie: makeSessionCookie('user_1') },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.traits.intensityPreference).toBe(0.7);
    expect(body.data.summaryNarrative).toContain('DNA summary');
    expect(computeTasteProfileMock).toHaveBeenCalledWith('user_1', { packId: 'pack_horror', persist: false });
  });

  it('returns computed DNA values', async () => {
    userFindUniqueMock.mockResolvedValueOnce({ id: 'user_1' });
    computeTasteProfileMock.mockResolvedValueOnce({
      intensityPreference: 0.3,
      pacingPreference: 0.6,
      psychologicalVsSupernatural: 0.4,
      goreTolerance: 0.2,
      ambiguityTolerance: 0.7,
      nostalgiaBias: 0.45,
      auteurAffinity: 0.5,
      lastComputedAt: new Date('2026-03-03T01:00:00.000Z'),
    });

    const response = await GET(new Request('http://localhost/api/profile/dna', {
      headers: { cookie: makeSessionCookie('user_1') },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(computeTasteProfileMock).toHaveBeenCalledWith('user_1', { packId: 'pack_horror', persist: false });
    expect(body.data.traits.goreTolerance).toBe(0.2);
  });
});
