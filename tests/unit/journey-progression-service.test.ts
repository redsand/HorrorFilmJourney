import { describe, expect, it, vi } from 'vitest';
import { JourneyProgressionService } from '@/lib/journey/journey-progression-service';

describe('JourneyProgressionService', () => {
  it('increments mastery for watched interaction', async () => {
    const recommendationItemFindUnique = vi.fn().mockResolvedValue({
      rank: 2,
      batch: { journeyNode: 'ENGINE_V1_CORE#RANK_2' },
    });
    const recommendationBatchFindFirst = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn().mockResolvedValue({});

    const service = new JourneyProgressionService({
      recommendationItem: { findUnique: recommendationItemFindUnique },
      recommendationBatch: { findFirst: recommendationBatchFindFirst },
      journeyProgress: { upsert },
    } as never);

    await service.trackWatched({
      userId: 'user_1',
      recommendationItemId: 'rec_1',
      rating: 5,
      intensity: 4,
      emotions: ['tense'],
      workedBest: ['atmosphere'],
      recommend: true,
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0]?.[0];
    expect(call.where.userId_journeyNode).toEqual({
      userId: 'user_1',
      journeyNode: 'ENGINE_V1_CORE#RANK_2',
    });
    expect(call.update.completedCount).toEqual({ increment: 1 });
    expect(call.update.masteryScore.increment).toBeGreaterThan(0);
  });

  it('tracks nodes independently and returns current progression', async () => {
    const recommendationItemFindUnique = vi.fn()
      .mockResolvedValueOnce({ rank: 1, batch: { journeyNode: 'ENGINE_V1_CORE#RANK_1' } })
      .mockResolvedValueOnce({ rank: 4, batch: { journeyNode: 'ENGINE_V1_CORE#RANK_4' } });
    const recommendationBatchFindFirst = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn().mockResolvedValue({});
    const findFirst = vi.fn().mockResolvedValue({
      journeyNode: 'ENGINE_V1_CORE#RANK_3',
      masteryScore: 2.8,
      completedCount: 4,
    });
    const findMany = vi.fn().mockResolvedValue([
      { journeyNode: 'ENGINE_V1_CORE#RANK_3' },
      { journeyNode: 'ENGINE_V1_CORE#RANK_1' },
    ]);

    const service = new JourneyProgressionService({
      recommendationItem: { findUnique: recommendationItemFindUnique },
      recommendationBatch: { findFirst: recommendationBatchFindFirst },
      journeyProgress: { upsert, findFirst, findMany },
    } as never);

    await service.trackWatched({ userId: 'user_1', recommendationItemId: 'rec_1', rating: 4 });
    await service.trackWatched({ userId: 'user_1', recommendationItemId: 'rec_2', rating: 4 });

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]?.[0].where.userId_journeyNode.journeyNode).toBe('ENGINE_V1_CORE#RANK_1');
    expect(upsert.mock.calls[1]?.[0].where.userId_journeyNode.journeyNode).toBe('ENGINE_V1_CORE#RANK_4');

    const result = await service.getProfileProgress('user_1');
    expect(result.currentNode).toBe('ENGINE_V1_CORE#RANK_3');
    expect(result.completedCount).toBe(4);
    expect(result.nextMilestone).toBe(5);
    expect(result.unlockedThemes).toContain('ENGINE_V1_CORE#RANK_3');
  });
});
