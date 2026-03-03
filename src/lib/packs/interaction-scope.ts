import type { Prisma } from '@prisma/client';

export function buildPackScopedInteractionWhere(packId?: string | null): Prisma.UserMovieInteractionWhereInput {
  if (!packId) {
    return {};
  }

  return {
    OR: [
      {
        recommendationItem: {
          batch: {
            packId,
          },
        },
      },
      {
        recommendationItemId: null,
        movie: {
          nodeAssignments: {
            some: {
              node: {
                packId,
              },
            },
          },
        },
      },
    ],
  };
}

