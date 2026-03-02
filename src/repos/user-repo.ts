import type { Prisma, PrismaClient } from '@prisma/client';

export type CreateUserInput = {
  displayName: string;
  profile?: {
    tolerance?: number;
    pacePreference?: string | null;
    horrorDNA?: Prisma.JsonValue;
  };
};

export class UserRepo {
  constructor(private readonly prisma: PrismaClient) {}

  createWithProfile(input: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        displayName: input.displayName,
        profile: {
          create: {
            tolerance: input.profile?.tolerance,
            pacePreference: input.profile?.pacePreference,
            horrorDNA: input.profile?.horrorDNA,
          },
        },
      },
      include: {
        profile: true,
      },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }
}
