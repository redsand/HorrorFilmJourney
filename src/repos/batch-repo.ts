import type { Prisma, PrismaClient } from '@prisma/client';

export type CreateBatchInput = {
  userId: string;
  journeyNode?: string;
  rationale?: string;
  items: Array<{
    movieId: string;
    rank: number;
    whyImportant: string;
    whatItTeaches: string;
    historicalContext: string;
    nextStepHint: string;
    watchFor: Prisma.JsonValue;
    reception?: Prisma.JsonValue;
    castHighlights?: Prisma.JsonValue;
    streaming?: Prisma.JsonValue;
    spoilerPolicy: string;
  }>;
};

export class BatchRepo {
  constructor(private readonly prisma: PrismaClient) {}

  createWithItems(input: CreateBatchInput) {
    return this.prisma.recommendationBatch.create({
      data: {
        userId: input.userId,
        journeyNode: input.journeyNode,
        rationale: input.rationale,
        items: {
          create: input.items,
        },
      },
      include: {
        items: {
          orderBy: { rank: 'asc' },
        },
      },
    });
  }
}
