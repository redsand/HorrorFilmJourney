import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type BackupMovie = {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  posterLastValidatedAt: string | null;
  synopsis: string | null;
  genres: unknown;
  keywords: unknown;
  country: string | null;
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
  schemaVersion: 1;
  generatedAt: string;
  summary: {
    movieCount: number;
    ratingCount: number;
    evidenceCount: number;
    maxTmdbId: number | null;
    latestReleaseDate: string | null;
  };
  movies: BackupMovie[];
};

function parseOutputPathArg(argv: string[]): string | null {
  const idx = argv.findIndex((arg) => arg === '--output');
  if (idx === -1) {
    return null;
  }
  const value = argv[idx + 1];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function defaultOutputPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `backups/catalog-backup-${stamp}.json`;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST;
  const prisma = databaseUrl
    ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    : new PrismaClient();

  try {
    const movies = await prisma.movie.findMany({
      orderBy: { tmdbId: 'asc' },
      select: {
        tmdbId: true,
        title: true,
        year: true,
        posterUrl: true,
        posterLastValidatedAt: true,
        synopsis: true,
        genres: true,
        keywords: true,
        country: true,
        director: true,
        castTop: true,
        ratings: {
          orderBy: { source: 'asc' },
          select: {
            source: true,
            value: true,
            scale: true,
            rawValue: true,
          },
        },
        evidencePackets: {
          orderBy: { retrievedAt: 'desc' },
          select: {
            sourceName: true,
            url: true,
            snippet: true,
            retrievedAt: true,
          },
        },
      },
    });

    const mapped: BackupMovie[] = movies.map((movie) => ({
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year ?? null,
      posterUrl: movie.posterUrl,
      posterLastValidatedAt: movie.posterLastValidatedAt ? movie.posterLastValidatedAt.toISOString() : null,
      synopsis: movie.synopsis ?? null,
      genres: movie.genres,
      keywords: movie.keywords,
      country: movie.country ?? null,
      director: movie.director ?? null,
      castTop: movie.castTop,
      ratings: movie.ratings.map((rating) => ({
        source: rating.source,
        value: rating.value,
        scale: rating.scale,
        rawValue: rating.rawValue ?? null,
      })),
      evidence: movie.evidencePackets.map((packet) => ({
        sourceName: packet.sourceName,
        url: packet.url,
        snippet: packet.snippet,
        retrievedAt: packet.retrievedAt.toISOString(),
      })),
    }));

    const ratingCount = mapped.reduce((sum, movie) => sum + movie.ratings.length, 0);
    const evidenceCount = mapped.reduce((sum, movie) => sum + movie.evidence.length, 0);
    const latestReleaseYear = mapped.reduce<number | null>((maxYear, movie) => {
      if (!movie.year || !Number.isInteger(movie.year)) {
        return maxYear;
      }
      if (maxYear === null || movie.year > maxYear) {
        return movie.year;
      }
      return maxYear;
    }, null);

    const backup: CatalogBackup = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      summary: {
        movieCount: mapped.length,
        ratingCount,
        evidenceCount,
        maxTmdbId: mapped.length > 0 ? mapped[mapped.length - 1]!.tmdbId : null,
        latestReleaseDate: latestReleaseYear ? `${latestReleaseYear}-12-31` : null,
      },
      movies: mapped,
    };

    const outputArg = parseOutputPathArg(process.argv.slice(2));
    const outputPath = resolve(outputArg ?? defaultOutputPath());
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');

    console.log(
      `Catalog backup complete: path=${outputPath} movies=${backup.summary.movieCount} ratings=${backup.summary.ratingCount} evidence=${backup.summary.evidenceCount} maxTmdbId=${backup.summary.maxTmdbId ?? 'n/a'} latestReleaseDate=${backup.summary.latestReleaseDate ?? 'n/a'}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Catalog backup failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
