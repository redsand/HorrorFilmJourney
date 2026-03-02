import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type BackupMovie = {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  posterLastValidatedAt: string | null;
  genres: unknown;
  director: string | null;
  castTop: unknown;
  ratings: Array<{
    source: string;
    value: number;
    scale: string;
    rawValue: string | null;
  }>;
  evidence: Array<{
    sourceName: string;
    url: string;
    snippet: string;
    retrievedAt: string;
  }>;
};

type CatalogBackup = {
  schemaVersion: number;
  movies: BackupMovie[];
};

function parseInputPathArg(argv: string[]): string {
  const idx = argv.findIndex((arg) => arg === '--input');
  if (idx === -1) {
    throw new Error('Missing --input <backup-file-path>');
  }
  const value = argv[idx + 1];
  if (!value || value.trim().length === 0) {
    throw new Error('Missing --input <backup-file-path>');
  }
  return value.trim();
}

function toEvidenceHash(input: { movieId: string; sourceName: string; url: string; snippet: string }): string {
  return createHash('sha256')
    .update(`${input.movieId}|${input.sourceName}|${input.url}|${input.snippet}`)
    .digest('hex');
}

async function main(): Promise<void> {
  const inputPath = resolve(parseInputPathArg(process.argv.slice(2)));
  const raw = await readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as CatalogBackup;
  if (!parsed || !Array.isArray(parsed.movies)) {
    throw new Error('Backup file is invalid: missing movies array');
  }

  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST;
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();

  let movieUpserts = 0;
  let ratingUpserts = 0;
  let evidenceUpserts = 0;

  try {
    for (const movie of parsed.movies) {
      if (!Number.isInteger(movie.tmdbId) || !movie.title || !movie.posterUrl) {
        // Skip malformed row but continue restore for remaining data.
        // eslint-disable-next-line no-continue
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const persisted = await prisma.movie.upsert({
        where: { tmdbId: movie.tmdbId },
        create: {
          tmdbId: movie.tmdbId,
          title: movie.title,
          year: movie.year ?? undefined,
          posterUrl: movie.posterUrl,
          posterLastValidatedAt: movie.posterLastValidatedAt ? new Date(movie.posterLastValidatedAt) : undefined,
          genres: movie.genres ?? undefined,
          director: movie.director ?? undefined,
          castTop: movie.castTop ?? undefined,
        },
        update: {
          title: movie.title,
          year: movie.year ?? undefined,
          posterUrl: movie.posterUrl,
          posterLastValidatedAt: movie.posterLastValidatedAt ? new Date(movie.posterLastValidatedAt) : undefined,
          genres: movie.genres ?? undefined,
          director: movie.director ?? undefined,
          castTop: movie.castTop ?? undefined,
        },
        select: { id: true },
      });
      movieUpserts += 1;

      for (const rating of movie.ratings ?? []) {
        if (!rating?.source || typeof rating.value !== 'number' || !rating.scale) {
          // eslint-disable-next-line no-continue
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await prisma.movieRating.upsert({
          where: {
            movieId_source: {
              movieId: persisted.id,
              source: rating.source,
            },
          },
          create: {
            movieId: persisted.id,
            source: rating.source,
            value: rating.value,
            scale: rating.scale,
            rawValue: rating.rawValue ?? null,
          },
          update: {
            value: rating.value,
            scale: rating.scale,
            rawValue: rating.rawValue ?? null,
          },
        });
        ratingUpserts += 1;
      }

      for (const evidence of movie.evidence ?? []) {
        if (!evidence?.sourceName || !evidence?.url || !evidence?.snippet) {
          // eslint-disable-next-line no-continue
          continue;
        }
        const hash = toEvidenceHash({
          movieId: persisted.id,
          sourceName: evidence.sourceName,
          url: evidence.url,
          snippet: evidence.snippet,
        });
        // eslint-disable-next-line no-await-in-loop
        await prisma.evidencePacket.upsert({
          where: { hash },
          create: {
            movieId: persisted.id,
            sourceName: evidence.sourceName,
            url: evidence.url,
            snippet: evidence.snippet,
            retrievedAt: evidence.retrievedAt ? new Date(evidence.retrievedAt) : new Date(),
            hash,
          },
          update: {
            sourceName: evidence.sourceName,
            url: evidence.url,
            snippet: evidence.snippet,
            retrievedAt: evidence.retrievedAt ? new Date(evidence.retrievedAt) : new Date(),
          },
        });
        evidenceUpserts += 1;
      }
    }

    const movieCount = await prisma.movie.count();
    console.log(
      `Catalog restore complete: input=${inputPath} movieUpserts=${movieUpserts} ratingUpserts=${ratingUpserts} evidenceUpserts=${evidenceUpserts} dbMovies=${movieCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Catalog restore failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
