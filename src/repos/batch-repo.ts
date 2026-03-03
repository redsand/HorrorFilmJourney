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
    watchFor: Prisma.InputJsonValue;
    reception?: Prisma.InputJsonValue;
    castHighlights?: Prisma.InputJsonValue;
    streaming?: Prisma.InputJsonValue;
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
          createMany: {
            data: input.items,
          },
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
