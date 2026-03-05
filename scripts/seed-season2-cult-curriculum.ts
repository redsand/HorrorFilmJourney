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
  subgenres?: string[];
  titles: CurriculumTitle[];
};

type CurriculumSpec = {
  seasonSlug: string;
  packSlug: string;
  minimumEligiblePerNode: number;
  targetEligiblePerNode: number;
  nodeSize?: number;
  nodes: CurriculumNode[];
  allowedOverlapKeys?: string[];
};

const SPEC_PATH = resolve('docs/season/season-2-cult-classics-curriculum.json');
const READINESS_PATH = resolve('docs/season/season-2-cult-classics-readiness.md');
const ALLOWLIST_PATH = resolve('docs/season/season-2-cult-classics-allowlist.json');
const BLOCKLIST_PATH = resolve('docs/season/season-2-cult-classics-blocklist.json');
const REVIEW_QUEUE_PATH = resolve('docs/season/season-2-cult-candidates-needing-review.json');
const SEASON2_TAXONOMY_VERSION = process.env.SEASON2_TAXONOMY_VERSION?.trim() || 'season-2-cult-v3';
const DEFAULT_NODE_OBJECTIVES: Record<string, string> = {
  'origins-of-cult-cinema': 'Origins of cult fandom and underground screenings.',
  'grindhouse-exploitation': 'Low-budget rebellion, shock cinema, and exploitation craft.',
  'psychotronic-cinema': 'Accidental masterpieces and outsider films with devoted fandom.',
  'cult-science-fiction': 'Visionary oddities, misunderstood epics, and speculative cults.',
  'outsider-cinema': 'Anti-establishment cinema and transgressive film movements.',
  'video-store-era': 'Rental-era discovery mechanics and shelf-driven cult canon.',
  'camp-cult-comedy': 'Offbeat comedic language that built repeat-viewing communities.',
  'modern-cult-phenomena': 'Internet-era cult formation, meme velocity, and revival loops.',
};

type TitleListEntry = {
  title: string;
  year?: number;
  reason?: string;
};

const FRANCHISE_KEYWORDS = [
  'avengers',
  'star wars',
  'batman',
  'superman',
  'spider-man',
  'jurassic',
  'mission impossible',
  'fast and furious',
  'transformers',
  'harry potter',
  'lord of the rings',
];
const CULT_KEYWORD_HINTS = [
  'cult',
  'midnight movie',
  'grindhouse',
  'exploitation',
  'b movie',
  'camp',
  'outsider',
  'underground',
  'video nasty',
  'transgressive',
];

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isAfterSeason2YearCap(year: number | null | undefined): boolean {
  const maxYear = parseIntEnv('SEASON2_MAX_YEAR', 2010);
  if (!Number.isInteger(year)) {
    return false;
  }
  return (year as number) > maxYear;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return raw.toLowerCase() === 'true';
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);
}

function tokenizeTitle(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .slice(0, 6);
}

function synthesizedSynopsis(input: { title: string; year: number | null; genres: string[] }): string {
  const genreText = input.genres.length > 0 ? input.genres.slice(0, 4).join(', ') : 'cult cinema';
  return `${input.title}${input.year ? ` (${input.year})` : ''} is a catalog title classified under ${genreText}.`;
}

function synthesizedKeywords(input: { title: string; genres: string[]; year: number | null }): string[] {
  const merged = [
    ...input.genres.map((genre) => genre.toLowerCase()),
    ...tokenizeTitle(input.title),
    ...(input.year ? [String(input.year)] : []),
  ];
  return [...new Set(merged)].slice(0, 24);
}

async function backfillCoreMovieMetadataForPack(prisma: PrismaClient, packId: string): Promise<void> {
  const movies = await prisma.movie.findMany({
    where: {
      nodeAssignments: {
        some: {
          node: { packId },
        },
      },
    },
    select: {
      id: true,
      title: true,
      year: true,
      synopsis: true,
      keywords: true,
      country: true,
      genres: true,
    },
  });

  for (const movie of movies) {
    const genres = parseJsonStringArray(movie.genres);
    const hasSynopsis = typeof movie.synopsis === 'string' && movie.synopsis.trim().length > 0;
    const hasKeywords = Array.isArray(movie.keywords) && movie.keywords.length > 0;
    const hasCountry = typeof movie.country === 'string' && movie.country.trim().length > 0;
    if (hasSynopsis && hasKeywords && hasCountry) {
      continue;
    }

    await prisma.movie.update({
      where: { id: movie.id },
      data: {
        ...(hasSynopsis ? {} : { synopsis: synthesizedSynopsis({ title: movie.title, year: movie.year, genres }) }),
        ...(hasKeywords ? {} : { keywords: synthesizedKeywords({ title: movie.title, genres, year: movie.year }) }),
        ...(hasCountry ? {} : { country: 'Unknown' }),
      },
    });
  }
}

function parseDiscoverPagesEnv(): number | 'all' {
  const raw = process.env.SEASON2_DISCOVER_PAGES?.trim().toLowerCase();
  if (!raw) {
    return 200;
  }
  if (raw === 'all') {
    return 'all';
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return parsed;
}

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

async function loadTitleList(path: string): Promise<TitleListEntry[]> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { entries?: TitleListEntry[] } | TitleListEntry[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
}

async function loadOptionalImdbCsvTitles(path: string): Promise<CurriculumTitle[]> {
  try {
    const raw = await readFile(path, 'utf8');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      return [];
    }
    const headers = parseCsvLine(lines[0]!);
    const titleIndex = headers.findIndex((header) => header.toLowerCase() === 'title');
    const yearIndex = headers.findIndex((header) => header.toLowerCase() === 'year');
    if (titleIndex < 0 || yearIndex < 0) {
      return [];
    }
    const titles: CurriculumTitle[] = [];
    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      const title = cols[titleIndex] ?? '';
      const yearRaw = cols[yearIndex] ?? '';
      const year = Number.parseInt(yearRaw, 10);
      if (!title || !Number.isInteger(year)) {
        continue;
      }
      titles.push({ title, year });
    }
    return titles;
  } catch {
    return [];
  }
}

function augmentSpecWithExternalTitles(spec: CurriculumSpec, extraTitles: CurriculumTitle[]): {
  merged: CurriculumSpec;
  importedCount: number;
} {
  if (extraTitles.length === 0 || spec.nodes.length === 0) {
    return { merged: spec, importedCount: 0 };
  }
  const seen = new Set<string>();
  spec.nodes.forEach((node) => {
    node.titles.forEach((entry) => seen.add(toTitleKey({ title: entry.altTitle ?? entry.title, year: entry.year })));
  });
  const nodes = spec.nodes.map((node) => ({ ...node, titles: [...node.titles] }));
  let cursor = 0;
  let importedCount = 0;
  for (const title of extraTitles) {
    const key = toTitleKey({ title: title.title, year: title.year });
    if (seen.has(key)) {
      continue;
    }
    nodes[cursor]!.titles.push(title);
    seen.add(key);
    cursor = (cursor + 1) % nodes.length;
    importedCount += 1;
  }
  return { merged: { ...spec, nodes }, importedCount };
}

function toTitleKey(input: { title: string; year?: number | null }): string {
  return `${normalizeTitle(input.title)}:${input.year ?? 'na'}`;
}

function scoreCultCandidate(input: {
  voteCount: number | null;
  voteAverage: number | null;
  popularity: number | null;
  releaseYear: number | null;
  genreIds: number[];
  keywordNames?: string[];
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const normalizedKeywords = (input.keywordNames ?? []).map((value) => value.toLowerCase());
  const hasCultKeyword = normalizedKeywords.some((keyword) =>
    CULT_KEYWORD_HINTS.some((hint) => keyword.includes(hint)),
  );
  const hasFranchiseKeyword = FRANCHISE_KEYWORDS.some((keyword) =>
    normalizedKeywords.some((entry) => entry.includes(normalizeTitle(keyword))),
  );
  const hasAnimationGenre = input.genreIds.includes(16);
  const likelyMainstreamBlockbuster =
    (input.voteCount ?? 0) >= 15000
    && (input.popularity ?? 0) >= 40
    && (input.releaseYear ?? 0) >= 1980;

  if ((input.voteCount ?? 0) >= 1000) {
    score += 1;
    reasons.push('vote-count>=1000');
  }
  if ((input.voteAverage ?? 0) >= 6.0) {
    score += 1;
    reasons.push('vote-average>=6.0');
  }
  if ((input.popularity ?? 0) >= 5 && (input.popularity ?? 0) <= 120) {
    score += 1;
    reasons.push('popularity-band');
  }
  if ((input.releaseYear ?? 3000) <= 2015) {
    score += 1;
    reasons.push('legacy-era');
  }
  const cultGenreIds = new Set([27, 53, 878, 14, 35, 28, 80, 9648, 10402]);
  if (input.genreIds.some((id) => cultGenreIds.has(id))) {
    score += 1;
    reasons.push('cult-genre-match');
  }
  if (hasCultKeyword) {
    score += 1;
    reasons.push('cult-keyword-hint');
  }
  if (hasAnimationGenre) {
    score -= 3;
    reasons.push('animation-penalty');
  }
  if (hasFranchiseKeyword) {
    score -= 2;
    reasons.push('franchise-penalty');
  }
  if (likelyMainstreamBlockbuster && !hasCultKeyword) {
    score -= 2;
    reasons.push('mainstream-blockbuster-penalty');
  }
  return { score, reasons };
}

function isFranchiseBlockbusterTitle(title: string): boolean {
  const normalized = normalizeTitle(title);
  return FRANCHISE_KEYWORDS.some((keyword) => normalized.includes(normalizeTitle(keyword)));
}

function isAnimatedGenre(genreIds: number[]): boolean {
  return genreIds.includes(16);
}

async function fetchCultDiscoverTmdbIds(maxPages: number | 'all'): Promise<{
  ids: number[];
  totalPages: number;
  scannedPages: number;
}> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return { ids: [], totalPages: 0, scannedPages: 0 };
  }

  const rawGenreFilter = process.env.SEASON2_DISCOVER_GENRES ?? '27|53|878|14|35|28|80|9648|10402';
  // TMDB discover/movie expects pipe (`|`) for OR semantics.
  // If commas are provided, normalize to OR to avoid accidental over-filtering.
  const genreFilter = rawGenreFilter.replace(/,/g, '|').replace(/\s+/g, '');
  const sortBy = process.env.SEASON2_DISCOVER_SORT ?? 'vote_count.desc';
  const includeAdult = process.env.SEASON2_DISCOVER_INCLUDE_ADULT === 'true' ? 'true' : 'false';
  const fromYear = parseIntEnv('SEASON2_DISCOVER_YEAR_START', 1950);
  const toYear = parseIntEnv('SEASON2_DISCOVER_YEAR_END', new Date().getUTCFullYear());
  const minVotes = parseIntEnv('SEASON2_DISCOVER_MIN_VOTE_COUNT', 5);

  const ids: number[] = [];
  const seen = new Set<number>();
  let totalPages = 0;
  let scannedPages = 0;

  const pageCap = maxPages === 'all' ? Number.MAX_SAFE_INTEGER : maxPages;
  for (let page = 1; page <= pageCap; page += 1) {
    const url = new URL('https://api.themoviedb.org/3/discover/movie');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('with_genres', genreFilter);
    url.searchParams.set('sort_by', sortBy);
    url.searchParams.set('language', 'en-US');
    url.searchParams.set('include_adult', includeAdult);
    url.searchParams.set('page', String(page));
    url.searchParams.set('vote_count.gte', String(minVotes));
    url.searchParams.set('primary_release_date.gte', `${fromYear}-01-01`);
    url.searchParams.set('primary_release_date.lte', `${toYear}-12-31`);

    const response = await fetch(url.toString());
    if (!response.ok) {
      break;
    }
    const payload = (await response.json()) as {
      results?: Array<{ id?: number }>;
      total_pages?: number;
    };
    const results = payload.results ?? [];
    scannedPages += 1;
    totalPages = payload.total_pages ?? totalPages;
    if (results.length === 0) {
      break;
    }
    for (const result of results) {
      if (!Number.isInteger(result.id)) {
        continue;
      }
      const id = result.id as number;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
    if (totalPages > 0 && page >= totalPages) {
      break;
    }
  }

  return { ids, totalPages, scannedPages };
}

async function resolveViaTmdb(input: { title: string; year: number }): Promise<{
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  genres: string[];
  director: string | null;
  castTop: Array<{ name: string; role?: string }>;
  genreIds: number[];
  keywordNames: string[];
  synopsis: string | null;
  country: string | null;
  tmdbRating: number | null;
  voteCount: number | null;
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
  detailsUrl.searchParams.set('append_to_response', 'credits,keywords');
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
    genres?: Array<{ id?: number; name?: string }>;
    popularity?: number;
    vote_average?: number;
    vote_count?: number;
    genre_ids?: number[];
    credits?: {
      crew?: Array<{ job?: string; name?: string }>;
      cast?: Array<{ name?: string; character?: string }>;
    };
    keywords?: { keywords?: Array<{ name?: string }> } | Array<{ name?: string }>;
    overview?: string;
    production_countries?: Array<{ name?: string }>;
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
    genreIds: (details.genres ?? [])
      .map((genre) => Number(genre.id))
      .filter((id) => Number.isInteger(id)),
    keywordNames: Array.isArray((details.keywords as { keywords?: Array<{ name?: string }> })?.keywords)
      ? (((details.keywords as { keywords?: Array<{ name?: string }> }).keywords) ?? [])
        .map((item) => item.name?.trim().toLowerCase() ?? '')
        .filter((value) => value.length > 0)
      : Array.isArray(details.keywords)
        ? (details.keywords as Array<{ name?: string }>)
          .map((item) => item.name?.trim().toLowerCase() ?? '')
          .filter((value) => value.length > 0)
        : [],
    synopsis: typeof details.overview === 'string' && details.overview.trim().length > 0
      ? details.overview.trim()
      : null,
    country: (details.production_countries ?? [])
      .map((item) => item.name?.trim() ?? '')
      .find((value) => value.length > 0) ?? null,
    tmdbRating: typeof details.vote_average === 'number' ? details.vote_average : null,
    voteCount: typeof details.vote_count === 'number' ? details.vote_count : null,
    popularity: typeof details.popularity === 'number' ? details.popularity : null,
  };
}

async function fetchTmdbDetailsById(tmdbId: number): Promise<{
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  genres: string[];
  director: string | null;
  castTop: Array<{ name: string; role?: string }>;
  genreIds: number[];
  keywordNames: string[];
  synopsis: string | null;
  country: string | null;
  tmdbRating: number | null;
  voteCount: number | null;
  popularity: number | null;
} | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return null;
  }

  const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  detailsUrl.searchParams.set('api_key', apiKey);
  detailsUrl.searchParams.set('append_to_response', 'credits,keywords');
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
    genres?: Array<{ id?: number; name?: string }>;
    popularity?: number;
    vote_average?: number;
    vote_count?: number;
    credits?: {
      crew?: Array<{ job?: string; name?: string }>;
      cast?: Array<{ name?: string; character?: string }>;
    };
    keywords?: { keywords?: Array<{ name?: string }> } | Array<{ name?: string }>;
    overview?: string;
    production_countries?: Array<{ name?: string }>;
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
    title: details.title ?? `TMDB ${tmdbId}`,
    year: Number.isInteger(year) ? year : null,
    posterUrl: typeof details.poster_path === 'string' && details.poster_path.length > 0
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : '',
    genres: (details.genres ?? [])
      .map((genre) => genre.name?.trim().toLowerCase() ?? '')
      .filter((genre) => genre.length > 0),
    director,
    castTop,
    genreIds: (details.genres ?? [])
      .map((genre) => Number(genre.id))
      .filter((id) => Number.isInteger(id)),
    keywordNames: Array.isArray((details.keywords as { keywords?: Array<{ name?: string }> })?.keywords)
      ? (((details.keywords as { keywords?: Array<{ name?: string }> }).keywords) ?? [])
        .map((item) => item.name?.trim().toLowerCase() ?? '')
        .filter((value) => value.length > 0)
      : Array.isArray(details.keywords)
        ? (details.keywords as Array<{ name?: string }>)
          .map((item) => item.name?.trim().toLowerCase() ?? '')
          .filter((value) => value.length > 0)
        : [],
    synopsis: typeof details.overview === 'string' && details.overview.trim().length > 0
      ? details.overview.trim()
      : null,
    country: (details.production_countries ?? [])
      .map((item) => item.name?.trim() ?? '')
      .find((value) => value.length > 0) ?? null,
    tmdbRating: typeof details.vote_average === 'number' ? details.vote_average : null,
    voteCount: typeof details.vote_count === 'number' ? details.vote_count : null,
    popularity: typeof details.popularity === 'number' ? details.popularity : null,
  };
}

async function enrichMovieFromTmdb(prisma: PrismaClient, movieId: string, tmdbId: number): Promise<void> {
  const details = await fetchTmdbDetailsById(tmdbId);
  if (!details) {
    return;
  }

  await prisma.movie.update({
    where: { id: movieId },
    data: {
      title: details.title,
      year: details.year,
      synopsis: details.synopsis,
      ...(details.posterUrl ? { posterUrl: details.posterUrl } : {}),
      genres: details.genres,
      keywords: details.keywordNames,
      country: details.country,
      director: details.director,
      castTop: details.castTop,
      ...(details.posterUrl ? { posterLastValidatedAt: new Date() } : {}),
    },
  });

  if (typeof details.tmdbRating === 'number') {
    await prisma.movieRating.upsert({
      where: { movieId_source: { movieId, source: 'IMDB' } },
      create: {
        movieId,
        source: 'IMDB',
        value: details.tmdbRating,
        scale: '10',
        rawValue: `${details.tmdbRating}/10`,
      },
      update: {
        value: details.tmdbRating,
        scale: '10',
        rawValue: `${details.tmdbRating}/10`,
      },
    });
    await prisma.movieRating.upsert({
      where: { movieId_source: { movieId, source: 'TMDB' } },
      create: {
        movieId,
        source: 'TMDB',
        value: details.tmdbRating,
        scale: '10',
        rawValue: `${details.tmdbRating}/10`,
      },
      update: {
        value: details.tmdbRating,
        scale: '10',
        rawValue: `${details.tmdbRating}/10`,
      },
    });
    await prisma.movieRating.upsert({
      where: { movieId_source: { movieId, source: 'TMDB_AUDIENCE_PROXY' } },
      create: {
        movieId,
        source: 'TMDB_AUDIENCE_PROXY',
        value: details.tmdbRating * 10,
        scale: '100',
        rawValue: `${(details.tmdbRating * 10).toFixed(0)}%`,
      },
      update: {
        value: details.tmdbRating * 10,
        scale: '100',
        rawValue: `${(details.tmdbRating * 10).toFixed(0)}%`,
      },
    });
  }

  if (typeof details.popularity === 'number') {
    await prisma.movieRating.upsert({
      where: { movieId_source: { movieId, source: 'TMDB_POPULARITY' } },
      create: {
        movieId,
        source: 'TMDB_POPULARITY',
        value: details.popularity,
        scale: '100',
        rawValue: `${details.popularity}`,
      },
      update: {
        value: details.popularity,
        scale: '100',
        rawValue: `${details.popularity}`,
      },
    });
  }
}

async function hydrateMovieByTmdbId(prisma: PrismaClient, tmdbId: number): Promise<{
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  director: string | null;
  castTop: unknown;
  ratings: Array<{ source: string }>;
  streamingCache: Array<{ id: string }>;
} | null> {
  const details = await fetchTmdbDetailsById(tmdbId);
  if (!details) {
    return null;
  }

  const movie = await prisma.movie.upsert({
    where: { tmdbId: details.tmdbId },
    create: {
      tmdbId: details.tmdbId,
      title: details.title,
      year: details.year,
      synopsis: details.synopsis,
      posterUrl: details.posterUrl,
      genres: details.genres,
      keywords: details.keywordNames,
      country: details.country,
      director: details.director,
      castTop: details.castTop,
      posterLastValidatedAt: details.posterUrl ? new Date() : null,
    },
    update: {
      title: details.title,
      year: details.year,
      synopsis: details.synopsis,
      ...(details.posterUrl ? { posterUrl: details.posterUrl, posterLastValidatedAt: new Date() } : {}),
      genres: details.genres,
      keywords: details.keywordNames,
      country: details.country,
      director: details.director,
      castTop: details.castTop,
    },
    select: { id: true },
  });

  await enrichMovieFromTmdb(prisma, movie.id, tmdbId);

  return prisma.movie.findUnique({
    where: { id: movie.id },
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
}

async function main(): Promise<void> {
  const baseSpec = await loadSpec();
  const imdbCsvPath = process.env.SEASON2_IMDB_LIST_PATH?.trim();
  const imdbTitles = imdbCsvPath ? await loadOptionalImdbCsvTitles(resolve(imdbCsvPath)) : [];
  const { merged: spec, importedCount } = augmentSpecWithExternalTitles(baseSpec, imdbTitles);
  const allowListEntries = await loadTitleList(ALLOWLIST_PATH);
  const blockListEntries = await loadTitleList(BLOCKLIST_PATH);
  const allowlist = new Set(allowListEntries.map((entry) => toTitleKey({ title: entry.title, year: entry.year })));
  const blocklist = new Set(blockListEntries.map((entry) => toTitleKey({ title: entry.title, year: entry.year })));
  const prisma = new PrismaClient();
  const unresolved: Array<{ nodeSlug: string; title: string; year: number; reason: string }> = [];
  const nodeSummaries: Array<{
    nodeSlug: string;
    subgenres: string[];
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
  const reviewQueue: Array<{ tmdbId: number; title: string; year: number | null; reason: string; nodeSlug: string }> = [];

  const defaultNodeSize = Math.max(1, parseIntEnv('SEASON2_NODE_SIZE', spec.nodeSize ?? spec.minimumEligiblePerNode ?? 30));
  const enableTopup = parseBoolEnv('SEASON2_ENABLE_TOPUP', false);
  const discoverPages = parseDiscoverPagesEnv();

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
    const globallyAssignedMovieIds = new Set<string>();
    const enforceGlobalDedup = enableTopup;
    const discover = await fetchCultDiscoverTmdbIds(discoverPages);
    const discoverTmdbIds = discover.ids;
    let discoverCursor = 0;
    let discoverAttempts = 0;
    let discoverInserted = 0;

    let totalRequested = 0;
    let totalSourceRequested = 0;
    let totalResolved = 0;
    let totalEligible = 0;
    let totalInserted = 0;

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
      const subgenres = Array.isArray(specNode.subgenres)
        ? specNode.subgenres.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
        : [];
      const eraSubgenreFocus = subgenres.length > 0 ? subgenres.join(' | ') : 'cult';
      const learningObjective = DEFAULT_NODE_OBJECTIVES[specNode.slug] ?? 'Season 2 curated learning objective.';
      await prisma.journeyNode.update({
        where: { id: node.id },
        data: {
          name: specNode.name,
          orderIndex: node.orderIndex,
          learningObjective,
          eraSubgenreFocus,
          whatToNotice: [],
          spoilerPolicyDefault: 'LIGHT',
        },
      });
      const nodeSize = enableTopup
        ? defaultNodeSize
        : Math.max(1, specNode.titles.length);

      const assignments: Array<{ nodeId: string; movieId: string; rank: number }> = [];
      let resolvedCount = 0;
      let eligibleCount = 0;
      let missingPoster = 0;
      let missingRatings = 0;
      let missingReception = 0;
      let missingCredits = 0;
      let missingStreaming = 0;

      if (enableTopup) {
        // In top-up mode, preserve existing assignments first.
        const existingAssignments = await prisma.nodeMovie.findMany({
          where: { nodeId: node.id },
          orderBy: { rank: 'asc' },
          select: {
            movie: {
              select: {
                id: true,
                tmdbId: true,
                title: true,
                year: true,
                posterUrl: true,
                genres: true,
                director: true,
                castTop: true,
                ratings: { select: { source: true } },
                streamingCache: { select: { id: true }, take: 1 },
              },
            },
          },
        });
        for (const assignment of existingAssignments) {
          if (assignments.length >= nodeSize) {
            break;
          }
          if (enforceGlobalDedup && globallyAssignedMovieIds.has(assignment.movie.id)) {
            continue;
          }
          const existingKey = toTitleKey({ title: assignment.movie.title, year: assignment.movie.year });
          if (blocklist.has(existingKey) && !allowlist.has(existingKey)) {
            reviewQueue.push({
              tmdbId: assignment.movie.tmdbId,
              title: assignment.movie.title,
              year: assignment.movie.year,
              reason: 'BLOCKLISTED_EXISTING_ASSIGNMENT',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          if (isFranchiseBlockbusterTitle(assignment.movie.title) && !allowlist.has(existingKey)) {
            reviewQueue.push({
              tmdbId: assignment.movie.tmdbId,
              title: assignment.movie.title,
              year: assignment.movie.year,
              reason: 'FRANCHISE_BLOCKBUSTER_EXISTING_ASSIGNMENT',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          const existingGenres = Array.isArray(assignment.movie.genres)
            ? assignment.movie.genres.map((value) => String(value).toLowerCase())
            : [];
          if (existingGenres.includes('animation') && !allowlist.has(existingKey)) {
            reviewQueue.push({
              tmdbId: assignment.movie.tmdbId,
              title: assignment.movie.title,
              year: assignment.movie.year,
              reason: 'ANIMATION_EXCLUDED_EXISTING_ASSIGNMENT',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          if (isAfterSeason2YearCap(assignment.movie.year)) {
            reviewQueue.push({
              tmdbId: assignment.movie.tmdbId,
              title: assignment.movie.title,
              year: assignment.movie.year,
              reason: 'YEAR_CAP_EXCLUDED_EXISTING_ASSIGNMENT',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          const evaluation = evaluateCurriculumEligibility({
            posterUrl: assignment.movie.posterUrl,
            director: assignment.movie.director,
            castTop: assignment.movie.castTop,
            ratings: assignment.movie.ratings,
            hasStreamingData: assignment.movie.streamingCache.length > 0,
          });
          if (!evaluation.isEligible) {
            continue;
          }
        assignments.push({
          nodeId: node.id,
          movieId: assignment.movie.id,
          rank: assignments.length + 1,
          tier: 'CORE',
          taxonomyVersion: SEASON2_TAXONOMY_VERSION,
        });
          if (enforceGlobalDedup) {
            globallyAssignedMovieIds.add(assignment.movie.id);
          }
          eligibleCount += 1;
          totalEligible += 1;
          duplicateCounter.set(
            assignment.movie.tmdbId,
            (duplicateCounter.get(assignment.movie.tmdbId) ?? 0) + 1,
          );
        }
      }

      totalRequested += nodeSize;
      totalSourceRequested += specNode.titles.length;
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
              synopsis: tmdbResolved.synopsis,
              posterUrl: tmdbResolved.posterUrl,
              genres: tmdbResolved.genres,
              keywords: tmdbResolved.keywordNames,
              country: tmdbResolved.country,
              director: tmdbResolved.director,
              castTop: tmdbResolved.castTop,
            },
            update: {
              title: tmdbResolved.title,
              year: tmdbResolved.year,
              synopsis: tmdbResolved.synopsis,
              posterUrl: tmdbResolved.posterUrl,
              genres: tmdbResolved.genres,
              keywords: tmdbResolved.keywordNames,
              country: tmdbResolved.country,
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

        if (resolved) {
          await enrichMovieFromTmdb(prisma, resolved.id, resolved.tmdbId);
          const refreshed = await prisma.movie.findUnique({
            where: { id: resolved.id },
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
          if (refreshed) {
            resolved = refreshed;
          }
        }
        if (isAfterSeason2YearCap(resolved.year)) {
          reviewQueue.push({
            tmdbId: resolved.tmdbId,
            title: resolved.title,
            year: resolved.year,
            reason: 'YEAR_CAP_EXCLUDED_CURATED',
            nodeSlug: specNode.slug,
          });
          continue;
        }

        resolvedCount += 1;
        totalResolved += 1;
        const detailsForQuality = await fetchTmdbDetailsById(resolved.tmdbId);
        if (detailsForQuality && isAnimatedGenre(detailsForQuality.genreIds)) {
          reviewQueue.push({
            tmdbId: resolved.tmdbId,
            title: resolved.title,
            year: resolved.year,
            reason: 'ANIMATION_EXCLUDED',
            nodeSlug: specNode.slug,
          });
          continue;
        }

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

        if (enforceGlobalDedup && globallyAssignedMovieIds.has(resolved.id)) {
          continue;
        }
        if (evaluation.isEligible) {
          eligibleCount += 1;
          totalEligible += 1;
        }
        duplicateCounter.set(resolved.tmdbId, (duplicateCounter.get(resolved.tmdbId) ?? 0) + 1);
        if (enforceGlobalDedup) {
          globallyAssignedMovieIds.add(resolved.id);
        }
        assignments.push({
          nodeId: node.id,
          movieId: resolved.id,
          rank: index + 1,
          tier: 'CORE',
          taxonomyVersion: SEASON2_TAXONOMY_VERSION,
        });
      }

      if (enableTopup && assignments.length < nodeSize) {
        const existingIds = new Set(assignments.map((assignment) => assignment.movieId));
        const additionalCandidates = await prisma.movie.findMany({
          orderBy: { tmdbId: 'asc' },
          select: {
            id: true,
            tmdbId: true,
            title: true,
            year: true,
            posterUrl: true,
            genres: true,
            director: true,
            castTop: true,
            ratings: { select: { source: true } },
            streamingCache: { select: { id: true }, take: 1 },
          },
        });

        const eligiblePool = additionalCandidates
          .filter((movie) => !existingIds.has(movie.id))
          .filter((movie) => !enforceGlobalDedup || !globallyAssignedMovieIds.has(movie.id))
          .filter((movie) =>
            evaluateCurriculumEligibility({
              posterUrl: movie.posterUrl,
              director: movie.director,
              castTop: movie.castTop,
              ratings: movie.ratings,
              hasStreamingData: movie.streamingCache.length > 0,
            }).isEligible,
          );

        for (const movie of eligiblePool) {
          if (assignments.length >= nodeSize) {
            break;
          }
          const key = toTitleKey({ title: movie.title, year: movie.year });
          if (blocklist.has(key) && !allowlist.has(key)) {
            reviewQueue.push({
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              reason: 'BLOCKLISTED_LOCAL_POOL',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          if (isFranchiseBlockbusterTitle(movie.title) && !allowlist.has(key)) {
            reviewQueue.push({
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              reason: 'FRANCHISE_BLOCKBUSTER_LOCAL_POOL',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          const localGenres = Array.isArray(movie.genres)
            ? movie.genres.map((value) => String(value).toLowerCase())
            : [];
          if (localGenres.includes('animation') && !allowlist.has(key)) {
            reviewQueue.push({
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              reason: 'ANIMATION_EXCLUDED_LOCAL_POOL',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          if (isAfterSeason2YearCap(movie.year)) {
            reviewQueue.push({
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              reason: 'YEAR_CAP_EXCLUDED_LOCAL_POOL',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          const localDetails = await fetchTmdbDetailsById(movie.tmdbId);
          if (localDetails && isAnimatedGenre(localDetails.genreIds) && !allowlist.has(key)) {
            reviewQueue.push({
              tmdbId: movie.tmdbId,
              title: movie.title,
              year: movie.year,
              reason: 'ANIMATION_EXCLUDED_LOCAL_POOL_TMDB',
              nodeSlug: specNode.slug,
            });
            continue;
          }
          if (localDetails) {
            const minCultScore = parseIntEnv('SEASON2_CULT_SCORE_MIN', 4);
            const cultScore = scoreCultCandidate({
              voteCount: localDetails.voteCount ?? null,
              voteAverage: localDetails.tmdbRating ?? null,
              popularity: localDetails.popularity ?? null,
              releaseYear: localDetails.year ?? movie.year,
              genreIds: localDetails.genreIds,
              keywordNames: localDetails.keywordNames,
            });
            if (cultScore.score < minCultScore && !allowlist.has(key)) {
              reviewQueue.push({
                tmdbId: movie.tmdbId,
                title: movie.title,
                year: movie.year,
                reason: `CULT_SCORE_TOO_LOW_LOCAL_POOL:${cultScore.score}<${minCultScore}`,
                nodeSlug: specNode.slug,
              });
              continue;
            }
          }
          assignments.push({
            nodeId: node.id,
            movieId: movie.id,
            rank: assignments.length + 1,
            tier: 'CORE',
            taxonomyVersion: SEASON2_TAXONOMY_VERSION,
          });
          if (enforceGlobalDedup) {
            globallyAssignedMovieIds.add(movie.id);
          }
          eligibleCount += 1;
          totalEligible += 1;
          duplicateCounter.set(movie.tmdbId, (duplicateCounter.get(movie.tmdbId) ?? 0) + 1);
        }
      }

      while (enableTopup && assignments.length < nodeSize && discoverCursor < discoverTmdbIds.length) {
        const tmdbId = discoverTmdbIds[discoverCursor]!;
        discoverCursor += 1;
        discoverAttempts += 1;

        const hydrated = await hydrateMovieByTmdbId(prisma, tmdbId);
        if (!hydrated) {
          continue;
        }
        const details = await fetchTmdbDetailsById(tmdbId);
        if (isAfterSeason2YearCap(details?.year ?? hydrated.year)) {
          reviewQueue.push({
            tmdbId,
            title: hydrated.title,
            year: details?.year ?? hydrated.year,
            reason: 'YEAR_CAP_EXCLUDED_DISCOVERY',
            nodeSlug: specNode.slug,
          });
          continue;
        }
        const key = toTitleKey({ title: hydrated.title, year: hydrated.year });
        if (blocklist.has(key) && !allowlist.has(key)) {
          reviewQueue.push({
            tmdbId,
            title: hydrated.title,
            year: hydrated.year,
            reason: 'BLOCKLISTED_DISCOVERY',
            nodeSlug: specNode.slug,
          });
          continue;
        }
        if (isFranchiseBlockbusterTitle(hydrated.title) && !allowlist.has(key)) {
          reviewQueue.push({
            tmdbId,
            title: hydrated.title,
            year: hydrated.year,
            reason: 'FRANCHISE_BLOCKBUSTER_HEURISTIC_DISCOVERY',
            nodeSlug: specNode.slug,
          });
          continue;
        }
        const cultScore = scoreCultCandidate({
          voteCount: details?.voteCount ?? null,
          voteAverage: details?.tmdbRating ?? null,
          popularity: details?.popularity ?? null,
          releaseYear: details?.year ?? hydrated.year,
          genreIds: details?.genreIds ?? [],
          keywordNames: details?.keywordNames ?? [],
        });
        const minCultScore = parseIntEnv('SEASON2_CULT_SCORE_MIN', 4);
        if (cultScore.score < minCultScore && !allowlist.has(key)) {
          reviewQueue.push({
            tmdbId,
            title: hydrated.title,
            year: hydrated.year,
            reason: `CULT_SCORE_TOO_LOW:${cultScore.score}<${minCultScore}`,
            nodeSlug: specNode.slug,
          });
          continue;
        }
        if (details && isAnimatedGenre(details.genreIds) && !allowlist.has(key)) {
          reviewQueue.push({
            tmdbId,
            title: hydrated.title,
            year: hydrated.year,
            reason: 'ANIMATION_EXCLUDED_DISCOVERY',
            nodeSlug: specNode.slug,
          });
          continue;
        }
        if (enforceGlobalDedup && globallyAssignedMovieIds.has(hydrated.id)) {
          continue;
        }
        const evaluation = evaluateCurriculumEligibility({
          posterUrl: hydrated.posterUrl,
          director: hydrated.director,
          castTop: hydrated.castTop,
          ratings: hydrated.ratings,
          hasStreamingData: hydrated.streamingCache.length > 0,
        });
        if (!evaluation.isEligible) {
          continue;
        }

        assignments.push({
          nodeId: node.id,
          movieId: hydrated.id,
          rank: assignments.length + 1,
          tier: 'CORE',
          taxonomyVersion: SEASON2_TAXONOMY_VERSION,
        });
        if (enforceGlobalDedup) {
          globallyAssignedMovieIds.add(hydrated.id);
        }
        eligibleCount += 1;
        totalEligible += 1;
        discoverInserted += 1;
        duplicateCounter.set(hydrated.tmdbId, (duplicateCounter.get(hydrated.tmdbId) ?? 0) + 1);
      }

      await prisma.nodeMovie.deleteMany({ where: { nodeId: node.id } });
      if (assignments.length > 0) {
        await prisma.nodeMovie.createMany({
          data: assignments,
          skipDuplicates: true,
        });
      }
      totalInserted += assignments.length;

      nodeSummaries.push({
        nodeSlug: specNode.slug,
        subgenres: Array.isArray(specNode.subgenres) ? specNode.subgenres : [],
        requested: nodeSize,
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

    await backfillCoreMovieMetadataForPack(prisma, pack.id);

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
    lines.push('| Node | Subgenres | Requested | Resolved | Eligible | Inserted |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
    nodeSummaries.forEach((item) => {
      lines.push(`| ${item.nodeSlug} | ${item.subgenres.length > 0 ? item.subgenres.join(', ') : 'n/a'} | ${item.requested} | ${item.resolved} | ${item.eligible} | ${item.inserted} |`);
    });
    lines.push('');
    lines.push('## External Source Imports');
    lines.push('');
    lines.push(`- IMDb CSV path: ${imdbCsvPath ?? 'not configured'}`);
    lines.push(`- IMDb imported unique titles: ${importedCount}`);
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
    lines.push(`- Discover page mode: ${discoverPages === 'all' ? 'all' : discoverPages}`);
    lines.push(`- TMDB discover total pages reported: ${discover.totalPages}`);
    lines.push(`- TMDB discover pages scanned: ${discover.scannedPages}`);
    lines.push(`- TMDB discovery attempts: ${discoverAttempts}`);
    lines.push(`- TMDB discovery inserted: ${discoverInserted}`);
    lines.push(`- Review queue candidates: ${reviewQueue.length}`);
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
    lines.push('- Reduce cross-node duplicates to <= 2%.');
    lines.push('- Resolve all unresolved titles or replace them.');
    lines.push('- Fill missing IMDb/additional ratings, reception, and credits gaps.');
    lines.push('- Keep pack disabled until all thresholds pass.');

    await writeFile(READINESS_PATH, `${lines.join('\n')}\n`, 'utf8');
    await writeFile(REVIEW_QUEUE_PATH, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      count: reviewQueue.length,
      items: reviewQueue,
    }, null, 2)}\n`, 'utf8');

    console.log(
      `Season 2 curriculum seed complete: nodes=${nodeSummaries.length} requested=${totalRequested} sourceRequested=${totalSourceRequested} importedFromCsv=${importedCount} resolved=${totalResolved} eligible=${totalEligible} inserted=${totalInserted} unresolved=${unresolved.length} duplicateRate=${duplicateRatePct.toFixed(2)}% discoverMode=${discoverPages === 'all' ? 'all' : discoverPages} discoverTotalPages=${discover.totalPages} discoverScannedPages=${discover.scannedPages} discoverAttempts=${discoverAttempts} discoverInserted=${discoverInserted}`,
    );
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
