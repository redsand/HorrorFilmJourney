import type { Prisma, PrismaClient } from '@prisma/client';

export type UpsertMovieInput = {
  tmdbId: number;
  title: string;
  year?: number;
  posterUrl: string;
  genres?: Prisma.InputJsonValue;
  director?: string;
  castTop?: Prisma.InputJsonValue;
};

export class MovieRepo {
  constructor(private readonly prisma: PrismaClient) {}

  upsertByTmdbId(input: UpsertMovieInput) {
    return this.prisma.movie.upsert({
      where: { tmdbId: input.tmdbId },
      create: input,
      update: {
        title: input.title,
        year: input.year,
        posterUrl: input.posterUrl,
        genres: input.genres,
        director: input.director,
        castTop: input.castTop,
      },
    });
  }
}
