import type { InteractionStatus, Prisma, PrismaClient } from '@prisma/client';

export type CreateInteractionInput = {
  userId: string;
  movieId: string;
  status: InteractionStatus;
  rating?: number;
  intensity?: number;
  emotions?: Prisma.JsonValue;
  workedBest?: Prisma.JsonValue;
  agedWell?: string;
  recommend?: boolean;
  note?: string;
  recommendationItemId?: string;
};

export class InteractionRepo {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateInteractionInput) {
    return this.prisma.userMovieInteraction.create({
      data: input,
    });
  }

  listByUser(userId: string) {
    return this.prisma.userMovieInteraction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        movie: true,
      },
    });
  }
}
