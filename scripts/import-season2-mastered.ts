import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient, type NodeAssignmentTier } from '@prisma/client';
import { listDeterministicCatalogBackfills } from '../src/lib/catalog/deterministic-tmdb-backfill.ts';

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

type ImportedMasteredLegacy = {
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

type MasteredNodeFilm = {
  title: string;
  year: number;
  tmdbId?: number | null;
};

type MasteredNodeV2 = {
  slug: string;
  core: MasteredNodeFilm[];
  extended: MasteredNodeFilm[];
};

type MasteredV2 = {
  season: string;
  taxonomyVersion?: string;
  summary?: {
    coreCount?: number;
    extendedCount?: number;
    totalUnique?: number;
  };
  nodes: MasteredNodeV2[];
};

type CliOptions = {
  input: string;
  activate: boolean;
};

type CatalogMovie = {
  tmdbId: number;
  title: string;
  year?: number | null;
  posterUrl?: string;
  synopsis?: string | null;
  genres?: unknown;
  keywords?: unknown;
  country?: string | null;
  director?: string | null;
  castTop?: unknown;
  ratings?: ImportedRating[];
};

type AssignmentRow = {
  tier: NodeAssignmentTier;
  rank: number;
  coreRank: number | null;
  title: string;
  year: number;
  tmdbId: number | null;
};

const CATALOG_BACKUP_PATH = resolve('backups/catalog-backup-2026-03-04T19-25-15-533Z.json');

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

function isLegacyMastered(value: unknown): value is ImportedMasteredLegacy {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<ImportedMasteredLegacy>;
  return Boolean(
    payload.season
      && typeof payload.season.slug === 'string'
      && payload.pack
      && typeof payload.pack.slug === 'string'
      && Array.isArray(payload.nodes),
  );
}

function isV2Mastered(value: unknown): value is MasteredV2 {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<MasteredV2>;
  return Boolean(
    typeof payload.season === 'string'
      && Array.isArray(payload.nodes)
      && payload.nodes.every((node) => node && typeof node.slug === 'string' && Array.isArray(node.core) && Array.isArray(node.extended)),
  );
}

function normalizeGenres(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);
}

function normalizeCastTop(input: unknown): Array<{ name: string; role?: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as { name?: unknown; role?: unknown };
      if (typeof item.name !== 'string' || item.name.trim().length === 0) return null;
      const name = item.name.trim();
      const role = typeof item.role === 'string' && item.role.trim().length > 0 ? item.role.trim() : undefined;
      return role ? { name, role } : { name };
    })
    .filter((entry): entry is { name: string; role?: string } => entry !== null)
    .slice(0, 8);
}

function normalizeKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0)
    .slice(0, 24);
}

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitleNoArticle(value: string): string {
  return normalizeTitle(value).replace(/^(the|a|an)\s+/, '');
}

function toFilmKey(title: string, year: number | null | undefined): string {
  return `${normalizeTitle(title)}::${Number(year) || 0}`;
}

function toFilmKeyNoArticle(title: string, year: number | null | undefined): string {
  return `${normalizeTitleNoArticle(title)}::${Number(year) || 0}`;
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part.length > 0 ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

async function loadCatalogMovies(): Promise<CatalogMovie[]> {
  const deterministic = listDeterministicCatalogBackfills();
  try {
    const raw = await readFile(CATALOG_BACKUP_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { movies?: CatalogMovie[] };
    const movies = Array.isArray(parsed.movies) ? parsed.movies : [];
    const seen = new Set(movies.map((movie) => movie.tmdbId));
    for (const seeded of deterministic) {
      if (seen.has(seeded.tmdbId)) continue;
      movies.push(seeded);
    }
    return movies;
  } catch {
    return deterministic;
  }
}

function chooseDeterministicCatalogMatch(
  item: { title: string; year: number },
  byTitleNoArticle: Map<string, CatalogMovie[]>,
): CatalogMovie | null {
  const candidates = byTitleNoArticle.get(normalizeTitleNoArticle(item.title)) ?? [];
  const close = candidates.filter((candidate) => Number.isInteger(candidate.year) && Math.abs((candidate.year as number) - item.year) <= 2);
  if (close.length === 1) return close[0]!;
  return null;
}

function convertV2ToLegacy(payload: MasteredV2): {
  season: { slug: string; name: string; isActive?: boolean };
  pack: { slug: string; name: string; isEnabled?: boolean };
  taxonomyVersion: string;
  nodes: Array<{ slug: string; name: string; orderIndex: number; assignments: AssignmentRow[] }>;
} {
  const taxonomyVersion = payload.taxonomyVersion?.trim() || 'season-2-cult-v3';
  const nodes = payload.nodes.map((node, index) => {
    const assignments: AssignmentRow[] = [];
    let rank = 1;
    let coreRank = 1;

    for (const film of node.core) {
      assignments.push({
        tier: 'CORE',
        rank,
        coreRank,
        title: film.title,
        year: film.year,
        tmdbId: Number.isInteger(film.tmdbId) ? film.tmdbId as number : null,
      });
      rank += 1;
      coreRank += 1;
    }

    for (const film of node.extended) {
      assignments.push({
        tier: 'EXTENDED',
        rank,
        coreRank: null,
        title: film.title,
        year: film.year,
        tmdbId: Number.isInteger(film.tmdbId) ? film.tmdbId as number : null,
      });
      rank += 1;
    }

    return {
      slug: node.slug,
      name: titleCaseFromSlug(node.slug),
      orderIndex: index,
      assignments,
    };
  });

  return {
    season: { slug: 'season-2', name: 'Season 2: Cult Classics' },
    pack: { slug: 'cult-classics', name: 'Cult Classics' },
    taxonomyVersion,
    nodes,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const inputPath = resolve(options.input);
  const raw = await readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  let normalized: {
    season: { slug: string; name: string; isActive?: boolean };
    pack: { slug: string; name: string; isEnabled?: boolean };
    taxonomyVersion: string;
    nodes: Array<{ slug: string; name: string; orderIndex: number; assignments: AssignmentRow[] }>;
  };

  if (isV2Mastered(parsed)) {
    normalized = convertV2ToLegacy(parsed);
  } else if (isLegacyMastered(parsed)) {
    normalized = {
      season: parsed.season,
      pack: parsed.pack,
      taxonomyVersion: process.env.SEASON2_TAXONOMY_VERSION?.trim() || 'season-2-cult-v3',
      nodes: parsed.nodes.map((node) => ({
        slug: node.slug,
        name: node.name,
        orderIndex: node.orderIndex,
        assignments: node.titles
          .filter((title) => Number.isInteger(title.tmdbId) && title.tmdbId > 0)
          .map((title) => ({
            tier: 'CORE' as NodeAssignmentTier,
            rank: Number.isInteger(title.rank) && title.rank > 0 ? title.rank : 1,
            coreRank: Number.isInteger(title.rank) && title.rank > 0 ? title.rank : null,
            title: title.title,
            year: typeof title.year === 'number' ? title.year : 0,
            tmdbId: title.tmdbId,
          })),
      })),
    };
  } else {
    throw new Error('Invalid mastered file shape.');
  }

  const catalogMovies = await loadCatalogMovies();
  const catalogByTmdb = new Map<number, CatalogMovie>();
  const catalogByKey = new Map<string, CatalogMovie>();
  const catalogByKeyNoArticle = new Map<string, CatalogMovie>();
  const byTitleNoArticle = new Map<string, CatalogMovie[]>();

  for (const movie of catalogMovies) {
    catalogByTmdb.set(movie.tmdbId, movie);
    const key = toFilmKey(movie.title, movie.year);
    const keyNoArticle = toFilmKeyNoArticle(movie.title, movie.year);
    if (!catalogByKey.has(key)) catalogByKey.set(key, movie);
    if (!catalogByKeyNoArticle.has(keyNoArticle)) catalogByKeyNoArticle.set(keyNoArticle, movie);
    const titleNoArticle = normalizeTitleNoArticle(movie.title);
    const list = byTitleNoArticle.get(titleNoArticle) ?? [];
    list.push(movie);
    byTitleNoArticle.set(titleNoArticle, list);
  }

  const prisma = new PrismaClient();
  try {
    const season = await prisma.season.upsert({
      where: { slug: normalized.season.slug },
      create: {
        slug: normalized.season.slug,
        name: normalized.season.name,
        isActive: options.activate ? true : Boolean(normalized.season.isActive),
      },
      update: {
        name: normalized.season.name,
        ...(options.activate ? { isActive: true } : {}),
      },
      select: { id: true, slug: true, name: true },
    });

    const pack = await prisma.genrePack.upsert({
      where: { slug: normalized.pack.slug },
      create: {
        slug: normalized.pack.slug,
        name: normalized.pack.name,
        seasonId: season.id,
        primaryGenre: 'cult',
        description: 'Midnight movies, grindhouse legends, and the underground canon.',
        isEnabled: options.activate ? true : Boolean(normalized.pack.isEnabled),
      },
      update: {
        name: normalized.pack.name,
        seasonId: season.id,
        ...(options.activate ? { isEnabled: true } : {}),
      },
      select: { id: true, slug: true, name: true },
    });

    const targetNodeSlugs = new Set(normalized.nodes.map((node) => node.slug));
    await prisma.journeyNode.deleteMany({
      where: {
        packId: pack.id,
        slug: { notIn: [...targetNodeSlugs] },
      },
    });

    if (options.activate) {
      await prisma.$transaction([
        prisma.season.updateMany({ data: { isActive: false } }),
        prisma.season.update({ where: { id: season.id }, data: { isActive: true } }),
        prisma.genrePack.update({ where: { id: pack.id }, data: { isEnabled: true } }),
      ]);
    }

    let importedMovieCount = 0;
    let importedAssignmentCount = 0;
    let skippedMissingTmdb = 0;
    let skippedGlobalDuplicateTmdb = 0;
    const unresolvedSamples: Array<{ title: string; year: number; nodeSlug: string; tier: NodeAssignmentTier }> = [];
    const globallyAssignedTmdb = new Set<number>();

    for (const node of normalized.nodes) {
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
          taxonomyVersion: normalized.taxonomyVersion,
          learningObjective: `${node.name} movement and cult reception history.`,
          whatToNotice: [],
          eraSubgenreFocus: 'cult',
          spoilerPolicyDefault: 'NO_SPOILERS',
          orderIndex: node.orderIndex,
        },
        update: {
          name: node.name,
          orderIndex: node.orderIndex,
          taxonomyVersion: normalized.taxonomyVersion,
        },
        select: { id: true },
      });

      const seenTmdb = new Set<number>();
      const assignments: Array<{
        nodeId: string;
        movieId: string;
        rank: number;
        tier: NodeAssignmentTier;
        coreRank: number | null;
        source: string;
        taxonomyVersion: string;
      }> = [];

      for (const row of node.assignments) {
        let tmdbId = Number.isInteger(row.tmdbId) ? (row.tmdbId as number) : null;
        let catalogMovie: CatalogMovie | null = tmdbId ? (catalogByTmdb.get(tmdbId) ?? null) : null;

        if (!catalogMovie) {
          const byExact = catalogByKey.get(toFilmKey(row.title, row.year))
            ?? catalogByKeyNoArticle.get(toFilmKeyNoArticle(row.title, row.year))
            ?? null;
          if (byExact) {
            catalogMovie = byExact;
            tmdbId = byExact.tmdbId;
          }
        }

        if (!catalogMovie) {
          const resolved = chooseDeterministicCatalogMatch({ title: row.title, year: row.year }, byTitleNoArticle);
          if (resolved) {
            catalogMovie = resolved;
            tmdbId = resolved.tmdbId;
          }
        }

        if (!tmdbId) {
          skippedMissingTmdb += 1;
          if (unresolvedSamples.length < 25) {
            unresolvedSamples.push({ title: row.title, year: row.year, nodeSlug: node.slug, tier: row.tier });
          }
          continue;
        }

        if (seenTmdb.has(tmdbId)) {
          continue;
        }
        if (globallyAssignedTmdb.has(tmdbId)) {
          skippedGlobalDuplicateTmdb += 1;
          continue;
        }
        seenTmdb.add(tmdbId);
        globallyAssignedTmdb.add(tmdbId);

        const persistedMovie = await prisma.movie.upsert({
          where: { tmdbId },
          create: {
            tmdbId,
            title: catalogMovie?.title ?? row.title,
            year: catalogMovie?.year ?? row.year,
            synopsis: typeof catalogMovie?.synopsis === 'string' ? catalogMovie.synopsis : null,
            posterUrl: catalogMovie?.posterUrl && catalogMovie.posterUrl.trim().length > 0
              ? catalogMovie.posterUrl.trim()
              : `https://image.tmdb.org/t/p/w500/placeholder-${tmdbId}.jpg`,
            genres: normalizeGenres(catalogMovie?.genres),
            keywords: normalizeKeywords(catalogMovie?.keywords),
            country: typeof catalogMovie?.country === 'string' ? catalogMovie.country : null,
            director: catalogMovie?.director ?? null,
            castTop: normalizeCastTop(catalogMovie?.castTop),
          },
          update: {
            title: catalogMovie?.title ?? row.title,
            year: catalogMovie?.year ?? row.year,
            synopsis: typeof catalogMovie?.synopsis === 'string' ? catalogMovie.synopsis : null,
            ...(catalogMovie?.posterUrl && catalogMovie.posterUrl.trim().length > 0 ? { posterUrl: catalogMovie.posterUrl.trim() } : {}),
            genres: normalizeGenres(catalogMovie?.genres),
            keywords: normalizeKeywords(catalogMovie?.keywords),
            country: typeof catalogMovie?.country === 'string' ? catalogMovie.country : null,
            director: catalogMovie?.director ?? null,
            castTop: normalizeCastTop(catalogMovie?.castTop),
          },
          select: { id: true },
        });
        importedMovieCount += 1;

        for (const rating of catalogMovie?.ratings ?? []) {
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
        }

        assignments.push({
          nodeId: upsertedNode.id,
          movieId: persistedMovie.id,
          rank: row.rank,
          tier: row.tier,
          coreRank: row.tier === 'CORE' ? row.coreRank : null,
          source: 'season2-mastered-import',
          taxonomyVersion: normalized.taxonomyVersion,
        });
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

    const summary = await prisma.nodeMovie.groupBy({
      by: ['tier'],
      where: {
        node: { packId: pack.id },
        taxonomyVersion: normalized.taxonomyVersion,
      },
      _count: { _all: true },
    });

    const tierCounts = new Map(summary.map((item) => [item.tier, item._count._all] as const));

    console.log(
      `Season 2 import complete: input=${inputPath} season=${season.slug} pack=${pack.slug} taxonomyVersion=${normalized.taxonomyVersion} assignments=${importedAssignmentCount} core=${tierCounts.get('CORE') ?? 0} extended=${tierCounts.get('EXTENDED') ?? 0} skippedMissingTmdb=${skippedMissingTmdb} skippedGlobalDuplicateTmdb=${skippedGlobalDuplicateTmdb} activate=${options.activate}`,
    );

    if (unresolvedSamples.length > 0) {
      console.log('Unresolved (sample):');
      unresolvedSamples.forEach((item) => {
        console.log(`- ${item.nodeSlug} ${item.tier}: ${item.title} (${item.year})`);
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 2 import failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
