import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { evaluateCurriculumEligibility } from '../src/lib/curriculum/eligibility.ts';

type CurriculumTitle = {
  title: string;
  year: number;
  altTitle?: string;
};

type CurriculumNode = {
  slug: string;
  name: string;
  titles: CurriculumTitle[];
};

type CurriculumSpec = {
  seasonSlug: string;
  packSlug: string;
  minimumEligiblePerNode: number;
  targetEligiblePerNode: number;
  nodes: CurriculumNode[];
};

type ResolvedMovie = {
  movieId: string;
  tmdbId: number;
  title: string;
  year: number | null;
  isEligible: boolean;
  missing: string[];
};

const SPEC_PATH = resolve('docs/season/season-2-cult-classics-curriculum.json');
const READINESS_PATH = resolve('docs/season/season-2-cult-classics-readiness.md');

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadSpec(): Promise<CurriculumSpec> {
  const raw = await readFile(SPEC_PATH, 'utf8');
  return JSON.parse(raw) as CurriculumSpec;
}

async function resolveViaTmdb(input: { title: string; year: number }): Promise<{
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  genres: string[];
  director: string | null;
  castTop: Array<{ name: string; role?: string }>;
  tmdbRating: number | null;
  popularity: number | null;
} | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return null;
  }

  const searchUrl = new URL('https://api.themoviedb.org/3/search/movie');
  searchUrl.searchParams.set('api_key', apiKey);
  searchUrl.searchParams.set('query', input.title);
  searchUrl.searchParams.set('year', String(input.year));
  searchUrl.searchParams.set('include_adult', 'false');

  const searchResponse = await fetch(searchUrl.toString());
  if (!searchResponse.ok) {
    return null;
  }
  const searchPayload = (await searchResponse.json()) as {
    results?: Array<{
      id: number;
      title?: string;
      release_date?: string;
      poster_path?: string | null;
      popularity?: number;
      vote_average?: number;
    }>;
  };

  const expected = normalizeTitle(input.title);
  const candidates = (searchPayload.results ?? []).filter((result) => Number.isInteger(result.id));
  if (candidates.length === 0) {
    return null;
  }
  const preferred = candidates.find((candidate) =>
    typeof candidate.title === 'string'
    && normalizeTitle(candidate.title) === expected
    && typeof candidate.release_date === 'string'
    && candidate.release_date.startsWith(`${input.year}`),
  ) ?? candidates[0];
  if (!preferred) {
    return null;
  }

  const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${preferred.id}`);
  detailsUrl.searchParams.set('api_key', apiKey);
  detailsUrl.searchParams.set('append_to_response', 'credits');
  detailsUrl.searchParams.set('language', 'en-US');

  const detailsResponse = await fetch(detailsUrl.toString());
  if (!detailsResponse.ok) {
    return null;
  }

  const details = (await detailsResponse.json()) as {
    id: number;
    title?: string;
    release_date?: string;
    poster_path?: string | null;
    genres?: Array<{ name?: string }>;
    popularity?: number;
    vote_average?: number;
    credits?: {
      crew?: Array<{ job?: string; name?: string }>;
      cast?: Array<{ name?: string; character?: string }>;
    };
  };

  const director = details.credits?.crew?.find((entry) => entry.job === 'Director')?.name?.trim() ?? null;
  const castTop = (details.credits?.cast ?? [])
    .slice(0, 6)
    .map((entry) => ({
      name: entry.name?.trim() ?? '',
      ...(entry.character ? { role: entry.character.trim() } : {}),
    }))
    .filter((entry) => entry.name.length > 0);
  const year = typeof details.release_date === 'string' && details.release_date.length >= 4
    ? Number.parseInt(details.release_date.slice(0, 4), 10)
    : null;

  return {
    tmdbId: details.id,
    title: details.title ?? input.title,
    year: Number.isInteger(year) ? year : null,
    posterUrl: typeof details.poster_path === 'string' && details.poster_path.length > 0
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : '',
    genres: (details.genres ?? [])
      .map((genre) => genre.name?.trim().toLowerCase() ?? '')
      .filter((genre) => genre.length > 0),
    director,
    castTop,
    tmdbRating: typeof details.vote_average === 'number' ? details.vote_average : null,
    popularity: typeof details.popularity === 'number' ? details.popularity : null,
  };
}

async function main(): Promise<void> {
  const spec = await loadSpec();
  const prisma = new PrismaClient();
  const unresolved: Array<{ nodeSlug: string; title: string; year: number; reason: string }> = [];
  const nodeSummaries: Array<{
    nodeSlug: string;
    requested: number;
    resolved: number;
    eligible: number;
    inserted: number;
    missingPoster: number;
    missingRatings: number;
    missingReception: number;
    missingCredits: number;
    missingStreaming: number;
  }> = [];
  const duplicateCounter = new Map<number, number>();

  try {
    const pack = await prisma.genrePack.findFirst({
      where: {
        slug: spec.packSlug,
        season: { slug: spec.seasonSlug },
      },
      select: {
        id: true,
        isEnabled: true,
        nodes: {
          select: { id: true, slug: true, name: true, orderIndex: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!pack) {
      throw new Error(`Pack ${spec.packSlug} in ${spec.seasonSlug} is missing. Run migrations/seed first.`);
    }

    const movieIndex = new Map<string, Array<{
      id: string;
      tmdbId: number;
      title: string;
      year: number | null;
      posterUrl: string;
      director: string | null;
      castTop: unknown;
      ratings: Array<{ source: string }>;
      streamingCache: Array<{ id: string }>;
    }>>();
    const movies = await prisma.movie.findMany({
      select: {
        id: true,
        tmdbId: true,
        title: true,
        year: true,
        posterUrl: true,
        director: true,
        castTop: true,
        ratings: { select: { source: true } },
        streamingCache: { select: { id: true }, take: 1 },
      },
    });

    for (const movie of movies) {
      const key = `${normalizeTitle(movie.title)}|${movie.year ?? 'na'}`;
      const list = movieIndex.get(key) ?? [];
      list.push(movie);
      movieIndex.set(key, list);
    }

    const nodeBySlug = new Map(pack.nodes.map((node) => [node.slug, node] as const));

    for (const specNode of spec.nodes) {
      const node = nodeBySlug.get(specNode.slug);
      if (!node) {
        unresolved.push({
          nodeSlug: specNode.slug,
          title: '[node]',
          year: 0,
          reason: 'Node missing in database',
        });
        continue;
      }

      const assignments: Array<{ nodeId: string; movieId: string; rank: number }> = [];
      let resolvedCount = 0;
      let eligibleCount = 0;
      let missingPoster = 0;
      let missingRatings = 0;
      let missingReception = 0;
      let missingCredits = 0;
      let missingStreaming = 0;

      for (const [index, title] of specNode.titles.entries()) {
        const candidates = [
          `${normalizeTitle(title.title)}|${title.year}`,
          `${normalizeTitle(title.altTitle ?? '')}|${title.year}`,
        ]
          .map((key) => movieIndex.get(key) ?? [])
          .flat();
        let resolved = candidates[0];

        if (!resolved) {
          const tmdbResolved = await resolveViaTmdb({ title: title.altTitle ?? title.title, year: title.year });
          if (!tmdbResolved) {
            unresolved.push({
              nodeSlug: specNode.slug,
              title: title.title,
              year: title.year,
              reason: 'Not resolved from local DB or TMDB search',
            });
            continue;
          }

          const persisted = await prisma.movie.upsert({
            where: { tmdbId: tmdbResolved.tmdbId },
            create: {
              tmdbId: tmdbResolved.tmdbId,
              title: tmdbResolved.title,
              year: tmdbResolved.year,
              posterUrl: tmdbResolved.posterUrl,
              genres: tmdbResolved.genres,
              director: tmdbResolved.director,
              castTop: tmdbResolved.castTop,
            },
            update: {
              title: tmdbResolved.title,
              year: tmdbResolved.year,
              posterUrl: tmdbResolved.posterUrl,
              genres: tmdbResolved.genres,
              director: tmdbResolved.director,
              castTop: tmdbResolved.castTop,
            },
            select: {
              id: true,
              tmdbId: true,
              title: true,
              year: true,
              posterUrl: true,
              director: true,
              castTop: true,
            },
          });

          if (typeof tmdbResolved.tmdbRating === 'number') {
            await prisma.movieRating.upsert({
              where: { movieId_source: { movieId: persisted.id, source: 'TMDB' } },
              create: {
                movieId: persisted.id,
                source: 'TMDB',
                value: tmdbResolved.tmdbRating,
                scale: '10',
                rawValue: `${tmdbResolved.tmdbRating}/10`,
              },
              update: {
                value: tmdbResolved.tmdbRating,
                scale: '10',
                rawValue: `${tmdbResolved.tmdbRating}/10`,
              },
            });
          }

          if (typeof tmdbResolved.popularity === 'number') {
            await prisma.movieRating.upsert({
              where: { movieId_source: { movieId: persisted.id, source: 'TMDB_POPULARITY' } },
              create: {
                movieId: persisted.id,
                source: 'TMDB_POPULARITY',
                value: tmdbResolved.popularity,
                scale: '100',
                rawValue: `${tmdbResolved.popularity}`,
              },
              update: {
                value: tmdbResolved.popularity,
                scale: '100',
                rawValue: `${tmdbResolved.popularity}`,
              },
            });
          }

          const hydrated = await prisma.movie.findUnique({
            where: { id: persisted.id },
            select: {
              id: true,
              tmdbId: true,
              title: true,
              year: true,
              posterUrl: true,
              director: true,
              castTop: true,
              ratings: { select: { source: true } },
              streamingCache: { select: { id: true }, take: 1 },
            },
          });
          if (!hydrated) {
            unresolved.push({
              nodeSlug: specNode.slug,
              title: title.title,
              year: title.year,
              reason: 'Resolved movie hydration failed',
            });
            continue;
          }
          resolved = hydrated;
        }

        resolvedCount += 1;
        const evaluation = evaluateCurriculumEligibility({
          posterUrl: resolved.posterUrl,
          director: resolved.director,
          castTop: resolved.castTop,
          ratings: resolved.ratings,
          hasStreamingData: resolved.streamingCache.length > 0,
        });
        if (evaluation.missingPoster) missingPoster += 1;
        if (evaluation.missingRatings) missingRatings += 1;
        if (evaluation.missingReception) missingReception += 1;
        if (evaluation.missingCredits) missingCredits += 1;
        if (evaluation.missingStreaming) missingStreaming += 1;

        if (evaluation.isEligible) {
          eligibleCount += 1;
          duplicateCounter.set(resolved.tmdbId, (duplicateCounter.get(resolved.tmdbId) ?? 0) + 1);
          assignments.push({
            nodeId: node.id,
            movieId: resolved.id,
            rank: index + 1,
          });
        }
      }

      await prisma.nodeMovie.deleteMany({ where: { nodeId: node.id } });
      if (assignments.length > 0) {
        await prisma.nodeMovie.createMany({
          data: assignments,
          skipDuplicates: true,
        });
      }

      nodeSummaries.push({
        nodeSlug: specNode.slug,
        requested: specNode.titles.length,
        resolved: resolvedCount,
        eligible: eligibleCount,
        inserted: assignments.length,
        missingPoster,
        missingRatings,
        missingReception,
        missingCredits,
        missingStreaming,
      });
    }

    const duplicateEntries = [...duplicateCounter.entries()].filter(([, count]) => count > 1);
    const assignedEligibleCount = [...duplicateCounter.values()].reduce((acc, count) => acc + count, 0);
    const duplicateRatePct = assignedEligibleCount > 0
      ? (duplicateEntries.length / assignedEligibleCount) * 100
      : 0;

    const lines: string[] = [];
    lines.push('# Season 2 Cult Classics Readiness');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Coverage');
    lines.push('');
    lines.push('| Node | Requested | Resolved | Eligible | Inserted |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    nodeSummaries.forEach((item) => {
      lines.push(`| ${item.nodeSlug} | ${item.requested} | ${item.resolved} | ${item.eligible} | ${item.inserted} |`);
    });
    lines.push('');
    lines.push('## Missing Metadata Blockers');
    lines.push('');
    lines.push('| Node | Poster | Ratings | Reception | Credits | Streaming |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    nodeSummaries.forEach((item) => {
      lines.push(
        `| ${item.nodeSlug} | ${item.missingPoster} | ${item.missingRatings} | ${item.missingReception} | ${item.missingCredits} | ${item.missingStreaming} |`,
      );
    });
    lines.push('');
    lines.push('## Duplicate Analysis');
    lines.push('');
    lines.push(`- Eligible assigned titles: ${assignedEligibleCount}`);
    lines.push(`- Duplicate titles across nodes: ${duplicateEntries.length}`);
    lines.push(`- Duplicate rate: ${duplicateRatePct.toFixed(2)}%`);
    lines.push('');
    lines.push('## Needs Human Resolution');
    lines.push('');
    if (unresolved.length === 0) {
      lines.push('- None');
    } else {
      unresolved.forEach((item) => {
        lines.push(`- ${item.nodeSlug}: ${item.title} (${item.year}) — ${item.reason}`);
      });
    }
    lines.push('');
    lines.push('## Remaining Work Before Enabling');
    lines.push('');
    lines.push(`- Reach >= ${spec.minimumEligiblePerNode} eligible titles in every node.`);
    lines.push('- Reduce cross-node duplicates to <= 2%.');
    lines.push('- Resolve all unresolved titles or replace them.');
    lines.push('- Fill missing IMDb/additional ratings, reception, and credits gaps.');
    lines.push('- Keep pack disabled until all thresholds pass.');

    await writeFile(READINESS_PATH, `${lines.join('\n')}\n`, 'utf8');

    console.log(`Season 2 curriculum seed complete: nodes=${nodeSummaries.length} unresolved=${unresolved.length} duplicateRate=${duplicateRatePct.toFixed(2)}%`);
    console.log(`Readiness report updated: ${READINESS_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 2 curriculum seed failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
