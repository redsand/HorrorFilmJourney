import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type ImportedRating = {
  source: string;
  value: number;
  scale: string;
  rawValue?: string | null;
};

type ImportedTitle = {
  rank: number;
  tmdbId: number;
  title: string;
  year?: number | null;
  posterUrl?: string;
  genres?: unknown;
  synopsis?: string | null;
  keywords?: unknown;
  country?: string | null;
  director?: string | null;
  castTop?: unknown;
  ratings?: ImportedRating[];
};

type ImportedNode = {
  slug: string;
  name: string;
  orderIndex: number;
  titles: ImportedTitle[];
};

type ImportedMastered = {
  season: {
    slug: string;
    name: string;
    isActive?: boolean;
  };
  pack: {
    slug: string;
    name: string;
    isEnabled?: boolean;
  };
  nodes: ImportedNode[];
};

type CliOptions = {
  input: string;
  activate: boolean;
};

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const inputIndex = args.findIndex((arg) => arg === '--input');
  if (inputIndex === -1 || !args[inputIndex + 1]) {
    throw new Error('Missing required flag: --input <path-to-season2-mastered.json>');
  }
  return {
    input: args[inputIndex + 1]!,
    activate: args.includes('--activate'),
  };
}

function isValidMastered(value: unknown): value is ImportedMastered {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<ImportedMastered>;
  return Boolean(
    payload.season
      && typeof payload.season.slug === 'string'
      && typeof payload.season.name === 'string'
      && payload.pack
      && typeof payload.pack.slug === 'string'
      && typeof payload.pack.name === 'string'
      && Array.isArray(payload.nodes),
  );
}

function normalizeGenres(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);
}

function normalizeCastTop(input: unknown): Array<{ name: string; role?: string }> {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const item = entry as { name?: unknown; role?: unknown };
      if (typeof item.name !== 'string' || item.name.trim().length === 0) {
        return null;
      }
      const name = item.name.trim();
      const role = typeof item.role === 'string' && item.role.trim().length > 0
        ? item.role.trim()
        : undefined;
      return role ? { name, role } : { name };
    })
    .filter((entry): entry is { name: string; role?: string } => entry !== null)
    .slice(0, 8);
}

function normalizeKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0)
    .slice(0, 24);
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const inputPath = resolve(options.input);
  const raw = await readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isValidMastered(parsed)) {
    throw new Error('Invalid mastered file shape.');
  }

  const prisma = new PrismaClient();
  try {
    const season = await prisma.season.upsert({
      where: { slug: parsed.season.slug },
      create: {
        slug: parsed.season.slug,
        name: parsed.season.name,
        isActive: options.activate ? true : Boolean(parsed.season.isActive),
      },
      update: {
        name: parsed.season.name,
        ...(options.activate ? { isActive: true } : {}),
      },
      select: { id: true, slug: true, name: true },
    });

    const pack = await prisma.genrePack.upsert({
      where: { slug: parsed.pack.slug },
      create: {
        slug: parsed.pack.slug,
        name: parsed.pack.name,
        seasonId: season.id,
        primaryGenre: 'cult',
        description: 'Midnight movies, grindhouse legends, and the underground canon.',
        isEnabled: options.activate ? true : Boolean(parsed.pack.isEnabled),
      },
      update: {
        name: parsed.pack.name,
        seasonId: season.id,
        ...(options.activate ? { isEnabled: true } : {}),
      },
      select: { id: true, slug: true, name: true },
    });

    if (options.activate) {
      await prisma.$transaction([
        prisma.season.updateMany({ data: { isActive: false } }),
        prisma.season.update({ where: { id: season.id }, data: { isActive: true } }),
        prisma.genrePack.update({ where: { id: pack.id }, data: { isEnabled: true } }),
      ]);
    }

    let importedMovieCount = 0;
    let importedRatingCount = 0;
    let importedAssignmentCount = 0;

    for (const node of parsed.nodes) {
      const upsertedNode = await prisma.journeyNode.upsert({
        where: {
          packId_slug: {
            packId: pack.id,
            slug: node.slug,
          },
        },
        create: {
          packId: pack.id,
          slug: node.slug,
          name: node.name,
          learningObjective: 'Season 2 curated learning objective.',
          whatToNotice: [],
          eraSubgenreFocus: 'cult',
          spoilerPolicyDefault: 'NO_SPOILERS',
          orderIndex: node.orderIndex,
        },
        update: {
          name: node.name,
          orderIndex: node.orderIndex,
        },
        select: { id: true },
      });

      const uniqueByTmdb = new Map<number, ImportedTitle>();
      for (const title of node.titles) {
        if (!Number.isInteger(title.tmdbId) || title.tmdbId <= 0) {
          continue;
        }
        if (!uniqueByTmdb.has(title.tmdbId)) {
          uniqueByTmdb.set(title.tmdbId, title);
        }
      }

      const assignments: Array<{ nodeId: string; movieId: string; rank: number }> = [];
      let rankCursor = 1;

      for (const title of uniqueByTmdb.values()) {
        const persistedMovie = await prisma.movie.upsert({
          where: { tmdbId: title.tmdbId },
          create: {
            tmdbId: title.tmdbId,
            title: title.title,
            year: typeof title.year === 'number' ? title.year : undefined,
            synopsis: typeof title.synopsis === 'string' ? title.synopsis : undefined,
            posterUrl: title.posterUrl && title.posterUrl.trim().length > 0
              ? title.posterUrl.trim()
              : `https://image.tmdb.org/t/p/w500/placeholder-${title.tmdbId}.jpg`,
            genres: normalizeGenres(title.genres),
            keywords: normalizeKeywords(title.keywords),
            country: typeof title.country === 'string' ? title.country : undefined,
            director: title.director ?? undefined,
            castTop: normalizeCastTop(title.castTop),
          },
          update: {
            title: title.title,
            year: typeof title.year === 'number' ? title.year : undefined,
            synopsis: typeof title.synopsis === 'string' ? title.synopsis : undefined,
            ...(title.posterUrl && title.posterUrl.trim().length > 0 ? { posterUrl: title.posterUrl.trim() } : {}),
            genres: normalizeGenres(title.genres),
            keywords: normalizeKeywords(title.keywords),
            country: typeof title.country === 'string' ? title.country : undefined,
            director: title.director ?? undefined,
            castTop: normalizeCastTop(title.castTop),
          },
          select: { id: true },
        });
        importedMovieCount += 1;

        for (const rating of title.ratings ?? []) {
          if (!rating.source || typeof rating.value !== 'number' || !rating.scale) {
            continue;
          }
          await prisma.movieRating.upsert({
            where: {
              movieId_source: {
                movieId: persistedMovie.id,
                source: rating.source,
              },
            },
            create: {
              movieId: persistedMovie.id,
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
          importedRatingCount += 1;
        }

        assignments.push({
          nodeId: upsertedNode.id,
          movieId: persistedMovie.id,
          rank: Number.isInteger(title.rank) && title.rank > 0 ? title.rank : rankCursor,
        });
        rankCursor += 1;
      }

      await prisma.nodeMovie.deleteMany({ where: { nodeId: upsertedNode.id } });
      if (assignments.length > 0) {
        await prisma.nodeMovie.createMany({
          data: assignments,
          skipDuplicates: true,
        });
      }
      importedAssignmentCount += assignments.length;
    }

    console.log(
      `Season 2 import complete: input=${inputPath} season=${season.slug} pack=${pack.slug} movies=${importedMovieCount} ratings=${importedRatingCount} assignments=${importedAssignmentCount} activate=${options.activate}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 2 import failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
