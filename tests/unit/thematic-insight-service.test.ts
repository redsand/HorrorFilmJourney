import { InteractionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ThematicInsightService } from '@/lib/taste/thematic-insight-service';

describe('ThematicInsightService', () => {
  it('generates insights when enough rated data exists', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { status: InteractionStatus.WATCHED, rating: 5, intensity: 2, movie: { year: 1984, genres: ['horror', 'psychological'] } },
      { status: InteractionStatus.WATCHED, rating: 5, intensity: 2, movie: { year: 1986, genres: ['horror', 'psychological'] } },
      { status: InteractionStatus.ALREADY_SEEN, rating: 4, intensity: 3, movie: { year: 1988, genres: ['horror', 'psychological'] } },
      { status: InteractionStatus.WATCHED, rating: 2, intensity: 5, movie: { year: 2012, genres: ['horror', 'slasher'] } },
      { status: InteractionStatus.WATCHED, rating: 2, intensity: 5, movie: { year: 2014, genres: ['horror', 'slasher'] } },
      { status: InteractionStatus.ALREADY_SEEN, rating: 3, intensity: 4, movie: { year: 2016, genres: ['horror', 'slasher'] } },
      { status: InteractionStatus.WATCHED, rating: 4, intensity: 2, movie: { year: 1982, genres: ['horror', 'psychological'] } },
      { status: InteractionStatus.WATCHED, rating: 2, intensity: 5, movie: { year: 2018, genres: ['horror', 'slasher'] } },
    ]);

    const service = new ThematicInsightService({
      userMovieInteraction: { findMany },
    } as never);

    const result = await service.getInsights('user_1');
    expect(result.totalRated).toBeGreaterThanOrEqual(6);
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights.some((insight) => insight.type === 'comparison')).toBe(true);
  });
});
