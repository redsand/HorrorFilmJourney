import { InteractionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { TasteComputationService } from '@/lib/taste/taste-computation-service';

function makePrismaStub(interactions: Array<{
  status: InteractionStatus;
  rating: number | null;
  intensity: number | null;
  recommend: boolean | null;
  emotions: string[] | null;
  workedBest: string[] | null;
  createdAt: Date;
  movie: { genres: string[] | null; year: number | null };
}>) {
  return {
    userMovieInteraction: {
      findMany: vi.fn().mockResolvedValue(interactions),
      count: vi.fn().mockResolvedValue(interactions.length),
    },
    userTasteProfile: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    tasteSnapshot: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('TasteComputationService', () => {
  it('updates profile when new interactions are present', async () => {
    const prisma = makePrismaStub([
      {
        status: InteractionStatus.WATCHED,
        rating: 5,
        intensity: 5,
        recommend: true,
        emotions: ['tense'],
        workedBest: ['direction'],
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        movie: { genres: ['slasher', 'gore'], year: 1986 },
      },
    ]);
    const service = new TasteComputationService(prisma as never);

    const result = await service.computeTasteProfile('user_1');

    expect(result.intensityPreference).toBeGreaterThan(0.5);
    expect(result.goreTolerance).toBeGreaterThan(0.5);
    expect(prisma.userTasteProfile.upsert).toHaveBeenCalledTimes(1);
  });

  it('saves a taste snapshot when interaction interval is reached', async () => {
    process.env.TASTE_SNAPSHOT_INTERVAL = '2';
    const prisma = makePrismaStub([
      {
        status: InteractionStatus.WATCHED,
        rating: 5,
        intensity: 5,
        recommend: true,
        emotions: ['tense'],
        workedBest: ['direction'],
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        movie: { genres: ['slasher', 'gore'], year: 1986 },
      },
      {
        status: InteractionStatus.ALREADY_SEEN,
        rating: 4,
        intensity: 4,
        recommend: true,
        emotions: ['creepy'],
        workedBest: ['editing'],
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
        movie: { genres: ['psychological'], year: 1995 },
      },
    ]);
    const service = new TasteComputationService(prisma as never);

    await service.computeTasteProfile('user_1');

    expect(prisma.tasteSnapshot.create).toHaveBeenCalledTimes(1);
    delete process.env.TASTE_SNAPSHOT_INTERVAL;
  });

  it('applies recency bias so newer interactions shift traits', async () => {
    const newerLowOlderHigh = makePrismaStub([
      {
        status: InteractionStatus.WATCHED,
        rating: 1,
        intensity: 1,
        recommend: false,
        emotions: ['bored', 'slow', 'dull'],
        workedBest: [],
        createdAt: new Date('2026-03-03T00:00:00.000Z'),
        movie: { genres: ['psychological'], year: 2022 },
      },
      {
        status: InteractionStatus.WATCHED,
        rating: 5,
        intensity: 5,
        recommend: true,
        emotions: ['tense'],
        workedBest: ['pacing'],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        movie: { genres: ['slasher', 'gore'], year: 1984 },
      },
    ]);
    const newerHighOlderLow = makePrismaStub([
      {
        status: InteractionStatus.WATCHED,
        rating: 5,
        intensity: 5,
        recommend: true,
        emotions: ['tense'],
        workedBest: ['pacing'],
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        movie: { genres: ['slasher', 'gore'], year: 1984 },
      },
      {
        status: InteractionStatus.WATCHED,
        rating: 1,
        intensity: 1,
        recommend: false,
        emotions: ['bored', 'slow', 'dull'],
        workedBest: [],
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        movie: { genres: ['psychological'], year: 2022 },
      },
    ]);
    const serviceA = new TasteComputationService(newerLowOlderHigh as never);
    const serviceB = new TasteComputationService(newerHighOlderLow as never);

    const resultA = await serviceA.computeTasteProfile('user_1');
    const resultB = await serviceB.computeTasteProfile('user_1');

    expect(Math.abs(resultA.intensityPreference - resultB.intensityPreference)).toBeGreaterThan(0.001);
    expect(Math.abs(resultA.goreTolerance - resultB.goreTolerance)).toBeGreaterThan(0.001);
  });
});
