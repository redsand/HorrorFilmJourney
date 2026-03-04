import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type BuildWatchReasonInput = {
  seasonSlug: string;
  nodeSlug: string;
  movieMeta: {
    title: string;
    year?: number | null;
    country?: string | null;
    director?: string | null;
  };
  nodeMeta: {
    name: string;
    whatToNotice?: Prisma.JsonValue | null;
    subgenres?: string[];
  };
  curatedWatchReason?: string | null;
};

type ResolveWatchReasonInput = {
  seasonSlug: string;
  packSlug: string;
  tmdbId: number;
  nodeSlug?: string | null;
};

type CuratedWatchReasonIndex = Map<string, string>;

const curatedReasonCache = new Map<string, CuratedWatchReasonIndex>();
const subgenreCache = new Map<string, string[]>();

function normalizeKey(input: { title: string; year?: number | null }): string {
  const normalizedTitle = input.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const year = typeof input.year === 'number' ? String(input.year) : 'unknown';
  return `${normalizedTitle}|${year}`;
}

function normalizeOneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clipTo140(value: string): string {
  const normalized = normalizeOneLine(value);
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137).trimEnd()}...`;
}

function parseWhatToNotice(value: Prisma.JsonValue | null | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => normalizeOneLine(entry))
      .slice(0, 3);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['items', 'points', 'bullets', 'highlights']) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => normalizeOneLine(entry))
          .slice(0, 3);
      }
    }
  }
  return [];
}

function findCurriculumPath(seasonSlug: string, packSlug: string): string | null {
  const base = resolve(process.cwd(), 'docs', 'season');
  if (!existsSync(base)) {
    return null;
  }
  const prefix = `${seasonSlug}-${packSlug}`.toLowerCase();
  const file = readdirSync(base)
    .filter((name) =>
      name.toLowerCase().startsWith(prefix)
      && name.toLowerCase().includes('curriculum')
      && name.toLowerCase().endsWith('.json'))
    .sort()[0];
  return file ? resolve(base, file) : null;
}

function loadNodeSubgenres(seasonSlug: string, packSlug: string, nodeSlug: string): string[] {
  const cacheKey = `${seasonSlug}|${packSlug}|${nodeSlug}`;
  const cached = subgenreCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const curriculumPath = findCurriculumPath(seasonSlug, packSlug);
  if (!curriculumPath) {
    subgenreCache.set(cacheKey, []);
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(curriculumPath, 'utf8')) as { nodes?: Array<Record<string, unknown>> };
    const node = (parsed.nodes ?? []).find((entry) => String(entry.slug ?? '') === nodeSlug);
    if (!node) {
      subgenreCache.set(cacheKey, []);
      return [];
    }
    const fromArrays = [
      node.subgenres,
      node.subGenres,
      node.subgenreFocus,
      node.focusSubgenres,
      node.tags,
    ];
    for (const candidate of fromArrays) {
      if (Array.isArray(candidate)) {
        const values = candidate
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => normalizeOneLine(entry))
          .slice(0, 4);
        subgenreCache.set(cacheKey, values);
        return values;
      }
    }
  } catch {
    // ignore parse failures and use empty fallback.
  }
  subgenreCache.set(cacheKey, []);
  return [];
}

function findMasteredSnapshotPath(seasonSlug: string, packSlug: string): string | null {
  const base = resolve(process.cwd(), 'docs', 'season');
  if (!existsSync(base)) {
    return null;
  }
  const prefix = `${seasonSlug}-${packSlug}`.toLowerCase();
  const file = readdirSync(base)
    .filter((name) =>
      name.toLowerCase().startsWith(prefix)
      && name.toLowerCase().includes('mastered')
      && name.toLowerCase().endsWith('.json'))
    .sort()[0];
  return file ? resolve(base, file) : null;
}

function loadCuratedWatchReasonIndex(seasonSlug: string, packSlug: string): CuratedWatchReasonIndex {
  const cacheKey = `${seasonSlug}|${packSlug}`;
  const cached = curatedReasonCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const index = new Map<string, string>();
  const path = findMasteredSnapshotPath(seasonSlug, packSlug);
  if (path) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        nodes?: Array<{
          core?: Array<Record<string, unknown>>;
          extended?: Array<Record<string, unknown>>;
        }>;
      };
      for (const node of parsed.nodes ?? []) {
        for (const tier of [...(node.core ?? []), ...(node.extended ?? [])]) {
          if (typeof tier.title !== 'string') {
            continue;
          }
          const watchReason = typeof tier.watchReason === 'string' && tier.watchReason.trim().length > 0
            ? normalizeOneLine(tier.watchReason)
            : null;
          if (!watchReason) {
            continue;
          }
          index.set(normalizeKey({ title: tier.title, year: typeof tier.year === 'number' ? tier.year : null }), clipTo140(watchReason));
        }
      }
    } catch {
      // ignore parsing failures, use empty curated index
    }
  }
  curatedReasonCache.set(cacheKey, index);
  return index;
}

export function buildWatchReason(input: BuildWatchReasonInput): string {
  if (input.curatedWatchReason && input.curatedWatchReason.trim().length > 0) {
    return clipTo140(input.curatedWatchReason);
  }

  const notice = parseWhatToNotice(input.nodeMeta.whatToNotice).map((item) => item.replace(/[.;:]+$/g, ''));
  const subgenres = (input.nodeMeta.subgenres ?? [])
    .map((entry) => normalizeOneLine(entry))
    .filter((entry) => entry.length > 0);

  const focus = notice[0]
    ?? (subgenres.length > 0 ? `${subgenres.slice(0, 2).join(' + ')} lens` : `${input.nodeMeta.name} lens`);

  const factCandidates: string[] = [];
  if (typeof input.movieMeta.year === 'number') {
    factCandidates.push(String(input.movieMeta.year));
  }
  if (input.movieMeta.director && input.movieMeta.director.trim().length > 0) {
    factCandidates.push(`dir. ${normalizeOneLine(input.movieMeta.director)}`);
  }
  if (input.movieMeta.country && input.movieMeta.country.trim().length > 0) {
    factCandidates.push(normalizeOneLine(input.movieMeta.country));
  }

  const facts = factCandidates.slice(0, 2);
  const base = `${input.nodeMeta.name}: ${focus}${facts.length > 0 ? ` (${facts.join(', ')})` : ''}`;
  if (base.length <= 140) {
    return base;
  }

  const oneFact = factCandidates.slice(0, 1);
  const withOneFact = `${input.nodeMeta.name}: ${focus}${oneFact.length > 0 ? ` (${oneFact.join(', ')})` : ''}`;
  if (withOneFact.length <= 140) {
    return withOneFact;
  }

  const shortFocus = focus.slice(0, 70).trimEnd();
  const short = `${input.nodeMeta.name}: ${shortFocus}${oneFact.length > 0 ? ` (${oneFact.join(', ')})` : ''}`;
  return clipTo140(short);
}

export async function resolveWatchReasonForFilm(input: ResolveWatchReasonInput): Promise<string | null> {
  const curatedIndex = loadCuratedWatchReasonIndex(input.seasonSlug, input.packSlug);
  const assignment = await prisma.nodeMovie.findFirst({
    where: {
      movie: { tmdbId: input.tmdbId },
      node: {
        pack: {
          slug: input.packSlug,
          season: { slug: input.seasonSlug },
        },
        ...(input.nodeSlug ? { slug: input.nodeSlug } : {}),
      },
    },
    orderBy: [{ tier: 'asc' }, { coreRank: 'asc' }, { rank: 'asc' }],
    select: {
      movie: {
        select: {
          title: true,
          year: true,
          country: true,
          director: true,
        },
      },
      node: {
        select: {
          slug: true,
          name: true,
          whatToNotice: true,
          eraSubgenreFocus: true,
        },
      },
    },
  });
  if (!assignment) {
    return null;
  }

  const key = normalizeKey({ title: assignment.movie.title, year: assignment.movie.year });
  const curatedWatchReason = curatedIndex.get(key) ?? null;
  const subgenres = loadNodeSubgenres(input.seasonSlug, input.packSlug, assignment.node.slug);
  const fallbackSubgenres = assignment.node.eraSubgenreFocus
    .split(/[;,]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return buildWatchReason({
    seasonSlug: input.seasonSlug,
    nodeSlug: assignment.node.slug,
    movieMeta: {
      title: assignment.movie.title,
      year: assignment.movie.year,
      country: assignment.movie.country,
      director: assignment.movie.director,
    },
    nodeMeta: {
      name: assignment.node.name,
      whatToNotice: assignment.node.whatToNotice,
      subgenres: subgenres.length > 0 ? subgenres : fallbackSubgenres,
    },
    curatedWatchReason,
  });
}

export const __watchReasonTestUtils = {
  clipTo140,
  parseWhatToNotice,
  loadCuratedWatchReasonIndex,
  normalizeKey,
};
