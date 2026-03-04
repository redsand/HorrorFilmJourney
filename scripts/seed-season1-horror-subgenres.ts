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
  nodes: CurriculumNode[];
};

type TmdbSearchResult = {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  popularity?: number;
};

type TmdbSearchResponse = {
  results?: TmdbSearchResult[];
};

type TmdbCreditMember = {
  name?: string;
  job?: string;
  character?: string;
};

type TmdbMovieDetails = {
  id?: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  vote_average?: number;
  popularity?: number;
  credits?: {
    cast?: TmdbCreditMember[];
    crew?: TmdbCreditMember[];
  };
};

type ResolveResult = {
  movieId: string | null;
  tmdbId?: number;
  title: string;
  year: number;
  reason?: string;
};

type NodeSummary = {
  slug: string;
  requested: number;
  assigned: number;
  unresolved: number;
};

type CatalogMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  genres: string[];
  popularity: number;
  eligible: boolean;
};

type NodeClassifier = {
  strongTags: string[];
  mediumTags: string[];
  weakTags?: string[];
  excludeTags?: string[];
  titlePatterns?: RegExp[];
  minScore: number;
};

const SPEC_PATH = resolve('docs/season/season-1-horror-subgenre-curriculum.json');
const READINESS_PATH = resolve('docs/season/season-1-horror-subgenre-readiness.md');
const FETCH_TIMEOUT_MS = 12_000;

const OBJECTIVE_BY_NODE: Record<string, string> = {
  'supernatural-horror': 'Explore non-scientific dread driven by hauntings, possession, and paranormal forces.',
  'psychological-horror': 'Analyze dread built from perception, paranoia, and unstable identity.',
  'slasher-serial-killer': 'Track the evolution of human threat design and slasher grammar.',
  'creature-monster': 'Understand monster and creature threats as cinematic fear engines.',
  'body-horror': 'Study transformation and physical corruption as thematic horror tools.',
  'cosmic-horror': 'Identify existential dread, unknown entities, and reality breakdown motifs.',
  'folk-horror': 'Examine ritual, landscape, and collective belief as horror vectors.',
  'sci-fi-horror': 'Follow fear emerging from science, technology, and non-human intelligence.',
  'found-footage': 'Read realism simulation, diegetic cameras, and fragmented evidence pacing.',
  'survival-horror': 'Evaluate endurance narratives under overwhelming threat conditions.',
  'apocalyptic-horror': 'Map collapse narratives and end-state horror structures.',
  'gothic-horror': 'Read atmosphere, architecture, and decaying legacy themes in gothic form.',
  'horror-comedy': 'Measure tonal blend between fear, absurdity, and satirical release.',
  'splatter-extreme': 'Understand transgressive and explicit shock aesthetics.',
  'social-domestic-horror': 'Analyze family, class, and social pressure as horror mechanisms.',
  'experimental-horror': 'Track non-traditional structure, imagery, and surreal horror language.',
};

const ERA_BY_NODE: Record<string, string> = {
  'supernatural-horror': '1960s-present · supernatural, paranormal, possession',
  'psychological-horror': '1960s-present · psychological, surreal, paranoia',
  'slasher-serial-killer': '1960s-present · slasher, serial killer, stalker',
  'creature-monster': '1930s-present · creature, monster, animal attack',
  'body-horror': '1970s-present · transformation, mutation, infection',
  'cosmic-horror': '1980s-present · existential, eldritch, reality collapse',
  'folk-horror': '1960s-present · pagan, ritual, rural dread',
  'sci-fi-horror': '1970s-present · alien, technology, bio-experiment',
  'found-footage': '1990s-present · found footage, screenlife, mockumentary',
  'survival-horror': '1970s-present · wilderness, siege, escape',
  'apocalyptic-horror': '1960s-present · outbreak, collapse, end-state dread',
  'gothic-horror': '1920s-present · gothic, period dread, haunted legacy',
  'horror-comedy': '1970s-present · satire, parody, absurdist horror',
  'splatter-extreme': '1980s-present · gore, extreme, transgressive',
  'social-domestic-horror': '1960s-present · domestic, social allegory, class fear',
  'experimental-horror': '1960s-present · surreal, avant-garde, nonlinear dread',
};

const SPOILER_BY_NODE: Record<string, 'NO_SPOILERS' | 'LIGHT' | 'FULL'> = {
  'splatter-extreme': 'LIGHT',
};

const GENRE_NAME_BY_ID: Record<number, string> = {
  27: 'horror',
  53: 'thriller',
  9648: 'mystery',
  14: 'fantasy',
  878: 'sci-fi',
  80: 'crime',
  35: 'comedy',
  18: 'drama',
  12: 'adventure',
};

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function yearFromDate(value?: string): number | null {
  if (!value || value.length < 4) {
    return null;
  }
  const parsed = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function imdbApprox(voteAverage?: number): { value: number; rawValue: string } {
  const numeric = typeof voteAverage === 'number' && Number.isFinite(voteAverage) ? voteAverage : 6.5;
  const clamped = Math.max(1, Math.min(10, numeric));
  return { value: Number(clamped.toFixed(1)), rawValue: `${clamped.toFixed(1)}/10` };
}

function tmdbPopularityScore(popularity?: number): { value: number; rawValue: string } {
  const numeric = typeof popularity === 'number' && Number.isFinite(popularity) ? popularity : 25;
  const normalized = Math.max(1, Math.min(100, Math.round(numeric)));
  return { value: normalized, rawValue: `${normalized}/100` };
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTargetPerNode(requiredFloor: number): number | 'all' {
  const raw = process.env.SEASON1_TARGET_PER_NODE?.trim().toLowerCase();
  if (!raw || raw === 'all') {
    return 'all';
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 'all';
  }
  return Math.max(requiredFloor, parsed);
}

function parseMinEligiblePerNode(fallback: number): number {
  const raw = process.env.SEASON1_MIN_ELIGIBLE_PER_NODE?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const CLASSIFIER_BY_NODE: Record<string, NodeClassifier> = {
  'supernatural-horror': {
    strongTags: ['supernatural-horror', 'supernatural', 'occult', 'paranormal', 'ghost', 'haunting', 'demonic', 'possession'],
    mediumTags: ['mystery', 'fantasy', 'horror', 'religious-dread'],
    titlePatterns: [/\bghost\b/i, /\bhaunt/i, /\bconjuring\b/i, /\bparanormal\b/i, /\bexorcist\b/i, /\bgrudge\b/i, /\bring\b/i, /\binsidious\b/i, /\bamityville\b/i],
    minScore: 2.4,
  },
  'psychological-horror': {
    strongTags: ['psychological-horror', 'paranoia', 'surreal', 'dream-logic', 'lynchian', 'identity-horror'],
    mediumTags: ['mystery', 'horror'],
    weakTags: ['psychological'],
    titlePatterns: [/\bpsycho\b/i, /\bshining\b/i, /\blighthouse\b/i, /\bpossession\b/i, /\bmaud\b/i],
    minScore: 3.4,
  },
  'slasher-serial-killer': {
    strongTags: ['slasher-serial-killer', 'slasher', 'serial-killer', 'masked-killer', 'stalker', 'home-invasion'],
    mediumTags: ['thriller', 'crime', 'horror'],
    titlePatterns: [/\bhalloween\b/i, /\bfriday the 13th\b/i, /\bnightmare\b/i, /\bscream\b/i, /\bmaniac\b/i],
    minScore: 2.8,
  },
  'creature-monster': {
    strongTags: ['creature-monster', 'monster', 'creature-feature', 'animal-attack', 'kaiju', 'werewolf', 'vampire', 'mutant'],
    mediumTags: ['sci-fi', 'fantasy', 'horror'],
    titlePatterns: [/\bgodzilla\b/i, /\bking kong\b/i, /\bjaws\b/i, /\bpredator\b/i, /\btremors\b/i],
    minScore: 2.8,
  },
  'body-horror': {
    strongTags: ['body-horror', 'mutation', 'infection', 'parasite', 'medical', 'metamorphosis'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror'],
    titlePatterns: [/\bfly\b/i, /\bvideodrome\b/i, /\btetsuo\b/i, /\brabid\b/i, /\bcrimes of the future\b/i],
    minScore: 2.9,
  },
  'cosmic-horror': {
    strongTags: ['cosmic-horror', 'eldritch', 'existential', 'forbidden-knowledge', 'ancient-gods'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror', 'mystery'],
    weakTags: ['supernatural-horror'],
    titlePatterns: [/\bevent horizon\b/i, /\bannihilation\b/i, /\bmouth of madness\b/i, /\bcthulhu\b/i, /\bvoid\b/i],
    minScore: 2.6,
  },
  'folk-horror': {
    strongTags: ['folk-horror', 'pagan', 'ritual', 'rural', 'village-cult', 'witchcraft', 'occult'],
    mediumTags: ['fantasy', 'horror', 'mystery'],
    titlePatterns: [/\bwicker man\b/i, /\bwitch\b/i, /\bmidsommar\b/i, /\bapostle\b/i, /\bwailing\b/i],
    minScore: 2.9,
  },
  'sci-fi-horror': {
    strongTags: ['alien', 'tech-horror', 'cybernetic', 'genetic-experiment', 'space-horror'],
    mediumTags: ['horror', 'thriller', 'mystery', 'sci-fi'],
    titlePatterns: [/\balien\b/i, /\bthing\b/i, /\bannihilation\b/i, /\bscanners\b/i, /\binvisible man\b/i],
    weakTags: ['sci-fi-horror', 'sci-fi'],
    minScore: 3.4,
  },
  'found-footage': {
    strongTags: ['found-footage', 'mockumentary', 'screenlife', 'surveillance', 'analog-horror', 'lost-media'],
    mediumTags: ['horror', 'thriller', 'mystery'],
    titlePatterns: [/\bblair witch\b/i, /\bparanormal activity\b/i, /\brec\b/i, /\bv\/h\/s\b/i, /\blake mungo\b/i],
    minScore: 2.8,
  },
  'survival-horror': {
    strongTags: ['survival-horror', 'survival', 'wilderness', 'siege', 'escape', 'isolation'],
    mediumTags: ['thriller', 'horror', 'adventure'],
    titlePatterns: [/\bdescent\b/i, /\bhills have eyes\b/i, /\bwrong turn\b/i, /\bcrawl\b/i, /\bshallows\b/i],
    minScore: 2.8,
  },
  'apocalyptic-horror': {
    strongTags: ['apocalyptic-horror', 'zombie', 'outbreak', 'end-of-world', 'post-apocalyptic', 'viral-apocalypse'],
    mediumTags: ['sci-fi-horror', 'sci-fi', 'horror'],
    titlePatterns: [/\b28 days later\b/i, /\bdawn of the dead\b/i, /\bnight of the living dead\b/i, /\btrain to busan\b/i, /\bpontypool\b/i],
    minScore: 2.9,
  },
  'gothic-horror': {
    strongTags: ['gothic-horror', 'gothic', 'victorian', 'period-gothic', 'haunted-house'],
    mediumTags: ['fantasy', 'horror', 'drama'],
    titlePatterns: [/\bdracula\b/i, /\bfrankenstein\b/i, /\bnosferatu\b/i, /\bcrimson peak\b/i, /\bwoman in black\b/i],
    minScore: 2.8,
  },
  'horror-comedy': {
    strongTags: ['satire', 'parody', 'absurdist-horror', 'dark-comedy-horror'],
    mediumTags: ['comedy', 'horror', 'fantasy'],
    weakTags: ['horror-comedy', 'fantasy'],
    titlePatterns: [/\bshaun of the dead\b/i, /\bwhat we do in the shadows\b/i, /\btucker and dale\b/i, /\bre-animator\b/i, /\barmy of darkness\b/i],
    minScore: 3.5,
  },
  'splatter-extreme': {
    strongTags: ['splatter-extreme', 'gore', 'extreme', 'transgressive', 'new-french-extremity', 'shock-cinema'],
    mediumTags: ['horror', 'thriller', 'crime'],
    titlePatterns: [/\bmartyrs\b/i, /\bhostel\b/i, /\bsaw\b/i, /\bterrifier\b/i, /\bcannibal\b/i],
    minScore: 2.8,
  },
  'social-domestic-horror': {
    strongTags: ['social-allegory-horror', 'class-horror', 'family-horror', 'domestic-horror'],
    mediumTags: ['horror', 'thriller', 'drama'],
    weakTags: ['social-domestic-horror', 'drama'],
    titlePatterns: [/\bget out\b/i, /\bstepford\b/i, /\bhereditary\b/i, /\bus\b/i, /\bparasite\b/i],
    minScore: 3.0,
  },
  'experimental-horror': {
    strongTags: ['experimental-horror', 'avant-garde', 'surreal', 'dream-logic', 'lynchian'],
    mediumTags: ['horror', 'drama', 'fantasy'],
    weakTags: ['psychological'],
    excludeTags: ['horror-comedy', 'slasher'],
    titlePatterns: [/\beraserhead\b/i, /\bbegotten\b/i, /\bskinamarink\b/i, /\bhausu\b/i, /\bbeyond the black rainbow\b/i],
    minScore: 2.6,
  },
};

function computeNodeScore(nodeSlug: string, movie: CatalogMovie): number {
  if (!movie.genres.includes('horror')) {
    return Number.NEGATIVE_INFINITY;
  }
  const classifier = CLASSIFIER_BY_NODE[nodeSlug];
  if (!classifier) {
    return movie.genres.includes(nodeSlug) ? 10 : 1;
  }

  const genreSet = new Set(movie.genres);
  let score = 0;
  let strongHits = 0;
  for (const tag of classifier.strongTags) {
    if (genreSet.has(tag)) {
      strongHits += 1;
    }
  }
  score += Math.min(strongHits, 3) * 2;

  let mediumHits = 0;
  for (const tag of classifier.mediumTags) {
    if (genreSet.has(tag)) {
      mediumHits += 1;
    }
  }
  score += Math.min(mediumHits, 3) * 0.8;

  let weakHits = 0;
  for (const tag of classifier.weakTags ?? []) {
    if (genreSet.has(tag)) {
      weakHits += 1;
    }
  }
  score += Math.min(weakHits, 2) * 0.35;

  let excludeHits = 0;
  for (const tag of classifier.excludeTags ?? []) {
    if (genreSet.has(tag)) {
      excludeHits += 1;
    }
  }
  score -= excludeHits * 0.7;

  const title = movie.title.toLowerCase();
  const titleHits = (classifier.titlePatterns ?? []).filter((pattern) => pattern.test(title)).length;
  score += Math.min(titleHits, 2) * 1.8;

  return score;
}

function scoreMovieForNode(nodeSlug: string, movie: CatalogMovie): number {
  const classifier = CLASSIFIER_BY_NODE[nodeSlug];
  const raw = computeNodeScore(nodeSlug, movie);
  if (!Number.isFinite(raw)) {
    return raw;
  }
  if (!classifier) {
    return raw;
  }
  return raw >= classifier.minScore ? raw : Number.NEGATIVE_INFINITY;
}

function mapDiscoverGenres(genreIds: number[], nodeSlug: string): string[] {
  const base = genreIds
    .map((id) => GENRE_NAME_BY_ID[id])
    .filter((value): value is string => typeof value === 'string');
  const mapped: string[] = [...base];
  mapped.push(nodeSlug);
  if (genreIds.includes(878)) {
    mapped.push('sci-fi-horror');
  }
  if (genreIds.includes(35)) {
    mapped.push('horror-comedy');
  }
  if (genreIds.includes(53) || genreIds.includes(9648)) {
    mapped.push('psychological');
  }
  return [...new Set(mapped)];
}

async function loadSpec(): Promise<CurriculumSpec> {
  const raw = await readFile(SPEC_PATH, 'utf8');
  return JSON.parse(raw) as CurriculumSpec;
}

async function searchTmdbMovie(
  apiKey: string,
  title: string,
  year: number,
  options?: { includeAdult?: boolean; includeYear?: boolean },
): Promise<TmdbSearchResult | null> {
  const url = new URL('https://api.themoviedb.org/3/search/movie');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', title);
  if (options?.includeYear !== false) {
    url.searchParams.set('year', String(year));
  }
  url.searchParams.set('include_adult', options?.includeAdult ? 'true' : 'false');
  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json() as TmdbSearchResponse;
  const candidates = (payload.results ?? [])
    .filter((entry) => typeof entry.id === 'number')
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  if (candidates.length === 0) {
    return null;
  }
  const exact = candidates.find((entry) => {
    const entryYear = yearFromDate(entry.release_date);
    const yearMatches = entryYear === year;
    const titleMatches = normalizeTitle(entry.title ?? '') === normalizeTitle(title);
    return yearMatches && titleMatches;
  });
  return exact ?? candidates[0] ?? null;
}

async function fetchTmdbDetails(apiKey: string, tmdbId: number): Promise<TmdbMovieDetails | null> {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('append_to_response', 'credits');
  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    return null;
  }
  return await response.json() as TmdbMovieDetails;
}

async function upsertMovieFromTmdb(
  prisma: PrismaClient,
  nodeSlug: string,
  details: TmdbMovieDetails,
): Promise<{ id: string; tmdbId: number } | null> {
  if (!details.id || !details.title) {
    return null;
  }
  const tmdbId = details.id;
  const existing = await prisma.movie.findUnique({
    where: { tmdbId },
    select: { id: true, genres: true },
  });
  const existingGenres = parseJsonStringArray(existing?.genres);
  const derivedGenres = mapDiscoverGenres((details.genres ?? []).map((entry) => entry.id), nodeSlug);
  const mergedGenres = [...new Set([...existingGenres, ...derivedGenres])];
  const posterPath = details.poster_path?.trim();
  const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : `/api/posters/${tmdbId}`;
  const crew = details.credits?.crew ?? [];
  const cast = details.credits?.cast ?? [];
  const director = crew.find((person) => person.job === 'Director')?.name ?? null;
  const castTop = cast
    .slice(0, 6)
    .map((member) => ({ name: member.name ?? 'Unknown', role: member.character ?? undefined }));

  const movie = await prisma.movie.upsert({
    where: { tmdbId },
    create: {
      tmdbId,
      title: details.title,
      year: yearFromDate(details.release_date),
      posterUrl,
      posterLastValidatedAt: posterPath ? new Date() : null,
      genres: mergedGenres,
      director,
      castTop,
    },
    update: {
      title: details.title,
      year: yearFromDate(details.release_date),
      posterUrl,
      posterLastValidatedAt: posterPath ? new Date() : null,
      genres: mergedGenres,
      director,
      castTop,
    },
    select: { id: true },
  });

  const imdb = imdbApprox(details.vote_average);
  const tmdb = imdbApprox(details.vote_average);
  const popularity = tmdbPopularityScore(details.popularity);
  await prisma.movieRating.upsert({
    where: { movieId_source: { movieId: movie.id, source: 'IMDB' } },
    create: { movieId: movie.id, source: 'IMDB', value: imdb.value, scale: '10', rawValue: imdb.rawValue },
    update: { value: imdb.value, scale: '10', rawValue: imdb.rawValue },
  });
  await prisma.movieRating.upsert({
    where: { movieId_source: { movieId: movie.id, source: 'TMDB' } },
    create: { movieId: movie.id, source: 'TMDB', value: tmdb.value, scale: '10', rawValue: tmdb.rawValue },
    update: { value: tmdb.value, scale: '10', rawValue: tmdb.rawValue },
  });
  await prisma.movieRating.upsert({
    where: { movieId_source: { movieId: movie.id, source: 'TMDB_POPULARITY' } },
    create: { movieId: movie.id, source: 'TMDB_POPULARITY', value: popularity.value, scale: '100', rawValue: popularity.rawValue },
    update: { value: popularity.value, scale: '100', rawValue: popularity.rawValue },
  });

  return { id: movie.id, tmdbId };
}

async function resolveMovieId(
  prisma: PrismaClient,
  apiKey: string | null,
  nodeSlug: string,
  title: CurriculumTitle,
): Promise<ResolveResult> {
  const candidates = [title.title, title.altTitle].filter((value): value is string => typeof value === 'string');
  const byYear = await prisma.movie.findMany({
    where: { year: title.year },
    select: { id: true, tmdbId: true, title: true },
  });
  for (const candidate of candidates) {
    const normalized = normalizeTitle(candidate);
    const local = byYear.find((movie) => normalizeTitle(movie.title) === normalized);
    if (local) {
      return { movieId: local.id, tmdbId: local.tmdbId, title: title.title, year: title.year };
    }
  }

  if (!apiKey) {
    return { movieId: null, title: title.title, year: title.year, reason: 'TMDB_API_KEY missing' };
  }

  for (const candidate of candidates) {
    const attempts = [
      { includeAdult: false, includeYear: true },
      { includeAdult: true, includeYear: true },
      { includeAdult: false, includeYear: false },
      { includeAdult: true, includeYear: false },
    ];
    for (const attempt of attempts) {
      // eslint-disable-next-line no-await-in-loop
      const search = await searchTmdbMovie(apiKey, candidate, title.year, attempt);
      if (!search?.id) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const details = await fetchTmdbDetails(apiKey, search.id);
      if (!details) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const upserted = await upsertMovieFromTmdb(prisma, nodeSlug, details);
      if (upserted) {
        return { movieId: upserted.id, tmdbId: upserted.tmdbId, title: title.title, year: title.year };
      }
    }
  }

  return { movieId: null, title: title.title, year: title.year, reason: 'not found in local db or TMDB search' };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const apiKey = process.env.TMDB_API_KEY ?? null;
  const limitPerNode = parseIntEnv('SEASON1_REQUIRED_LIMIT_PER_NODE', 20);
  const targetPerNode = parseTargetPerNode(limitPerNode);
  const minEligiblePerNode = parseMinEligiblePerNode(64);
  try {
    const spec = await loadSpec();
    const season = await prisma.season.upsert({
      where: { slug: spec.seasonSlug },
      create: { slug: spec.seasonSlug, name: 'Season 1', isActive: true },
      update: {},
      select: { id: true },
    });
    const pack = await prisma.genrePack.upsert({
      where: { slug: spec.packSlug },
      create: {
        slug: spec.packSlug,
        name: 'Horror',
        seasonId: season.id,
        isEnabled: true,
        primaryGenre: 'horror',
        description: 'Foundational horror journey pack.',
      },
      update: { seasonId: season.id },
      select: { id: true },
    });

    const unresolved: Array<{ nodeSlug: string; title: string; year: number; reason: string }> = [];
    const summaries: NodeSummary[] = [];
    let totalRequested = 0;
    let totalAssigned = 0;

    const catalogPool: CatalogMovie[] = (await prisma.movie.findMany({
      select: {
        id: true,
        tmdbId: true,
        title: true,
        year: true,
        posterUrl: true,
        genres: true,
        director: true,
        castTop: true,
        ratings: { select: { source: true, value: true } },
      },
    }))
      .map((movie) => {
        const genres = parseJsonStringArray(movie.genres);
        const eligibility = evaluateCurriculumEligibility({
          posterUrl: movie.posterUrl ?? '',
          director: movie.director,
          castTop: movie.castTop,
          ratings: movie.ratings.map((rating) => ({ source: rating.source })),
          hasStreamingData: false,
        });
        const popularity = movie.ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.value ?? 0;
        return {
          id: movie.id,
          tmdbId: movie.tmdbId,
          title: movie.title,
          year: movie.year,
          genres,
          popularity,
          eligible: eligibility.isEligible,
        };
      })
      .filter((movie) => movie.eligible && movie.genres.includes('horror'));

    for (const [index, node] of spec.nodes.entries()) {
      const upsertedNode = await prisma.journeyNode.upsert({
        where: { packId_slug: { packId: pack.id, slug: node.slug } },
        create: {
          packId: pack.id,
          slug: node.slug,
          name: node.name,
          learningObjective: OBJECTIVE_BY_NODE[node.slug] ?? `${node.name} learning objective.`,
          whatToNotice: [
            'How tension is constructed',
            'How genre conventions are applied or subverted',
            'How tone and pacing shape audience response',
          ],
          eraSubgenreFocus: ERA_BY_NODE[node.slug] ?? 'Horror subgenre study',
          spoilerPolicyDefault: SPOILER_BY_NODE[node.slug] ?? 'NO_SPOILERS',
          orderIndex: index + 1,
        },
        update: {
          name: node.name,
          learningObjective: OBJECTIVE_BY_NODE[node.slug] ?? `${node.name} learning objective.`,
          eraSubgenreFocus: ERA_BY_NODE[node.slug] ?? 'Horror subgenre study',
          spoilerPolicyDefault: SPOILER_BY_NODE[node.slug] ?? 'NO_SPOILERS',
          orderIndex: index + 1,
        },
        select: { id: true },
      });

      const requestedTitles = node.titles.slice(0, limitPerNode);
      totalRequested += requestedTitles.length;
      const assignments: Array<{ nodeId: string; movieId: string; rank: number }> = [];
      let rank = 1;
      for (const required of requestedTitles) {
        // eslint-disable-next-line no-await-in-loop
        const resolved = await resolveMovieId(prisma, apiKey, node.slug, required);
        if (!resolved.movieId) {
          unresolved.push({
            nodeSlug: node.slug,
            title: required.title,
            year: required.year,
            reason: resolved.reason ?? 'unknown',
          });
          continue;
        }
        assignments.push({ nodeId: upsertedNode.id, movieId: resolved.movieId, rank });
        rank += 1;
      }

      await prisma.nodeMovie.deleteMany({ where: { nodeId: upsertedNode.id } });
      if (assignments.length > 0) {
        await prisma.nodeMovie.createMany({ data: assignments, skipDuplicates: true });
      }

      const shouldTopup = targetPerNode === 'all' || assignments.length < targetPerNode;
      if (shouldTopup) {
        const assignedIds = new Set(assignments.map((entry) => entry.movieId));
        const topupPool = catalogPool
          .filter((movie) => !assignedIds.has(movie.id))
          .map((movie) => ({
            movie,
            score: scoreMovieForNode(node.slug, movie),
          }))
          .filter((entry) => Number.isFinite(entry.score))
          .sort((a, b) => (b.score - a.score) || (b.movie.popularity - a.movie.popularity) || (a.movie.tmdbId - b.movie.tmdbId));
        const topup = (targetPerNode === 'all'
          ? topupPool
          : topupPool.slice(0, Math.max(0, targetPerNode - assignments.length)))
          .map((entry, i) => ({
            nodeId: upsertedNode.id,
            movieId: entry.movie.id,
            rank: rank + i,
          }));
        if (topup.length > 0) {
          await prisma.nodeMovie.createMany({ data: topup, skipDuplicates: true });
          assignments.push(...topup);
        }

        if (assignments.length < minEligiblePerNode) {
          const relaxedThreshold = node.slug === 'experimental-horror' ? 1.2 : 2.1;
          const relaxedPool = catalogPool
            .filter((movie) => !assignedIds.has(movie.id))
            .map((movie) => ({
              movie,
              strictScore: scoreMovieForNode(node.slug, movie),
              rawScore: computeNodeScore(node.slug, movie),
            }))
            .filter((entry) => !Number.isFinite(entry.strictScore))
            .filter((entry) => Number.isFinite(entry.rawScore) && entry.rawScore >= relaxedThreshold)
            .sort((a, b) => (b.rawScore - a.rawScore) || (b.movie.popularity - a.movie.popularity) || (a.movie.tmdbId - b.movie.tmdbId))
            .slice(0, Math.max(0, minEligiblePerNode - assignments.length))
            .map((entry, i) => ({
              nodeId: upsertedNode.id,
              movieId: entry.movie.id,
              rank: rank + topup.length + i,
            }));
          if (relaxedPool.length > 0) {
            await prisma.nodeMovie.createMany({ data: relaxedPool, skipDuplicates: true });
            assignments.push(...relaxedPool);
          }
        }
      }

      totalAssigned += assignments.length;
      summaries.push({
        slug: node.slug,
        requested: requestedTitles.length,
        assigned: assignments.length,
        unresolved: Math.max(0, requestedTitles.length - assignments.length),
      });
    }

    const lines: string[] = [];
    lines.push('# Season 1 Horror Required Subgenre Readiness');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`Requested titles: ${totalRequested}`);
    lines.push(`Target titles per node: ${targetPerNode === 'all' ? 'all eligible matches' : targetPerNode}`);
    lines.push(`Minimum eligible per node floor: ${minEligiblePerNode}`);
    lines.push(`Assigned titles: ${totalAssigned}`);
    lines.push(`Unresolved titles: ${unresolved.length}`);
    lines.push('');
    lines.push('## Per-node');
    lines.push('');
    lines.push('| Node | Requested | Assigned | Unresolved |');
    lines.push('| --- | ---: | ---: | ---: |');
    summaries.forEach((summary) => {
      lines.push(`| ${summary.slug} | ${summary.requested} | ${summary.assigned} | ${summary.unresolved} |`);
    });
    lines.push('');
    lines.push('## Unresolved');
    lines.push('');
    if (unresolved.length === 0) {
      lines.push('- None');
    } else {
      unresolved.forEach((item) => {
        lines.push(`- ${item.nodeSlug}: ${item.title} (${item.year}) — ${item.reason}`);
      });
    }
    lines.push('');
    lines.push('## Next sync recommendation');
    lines.push('');
    lines.push('- Run `npm run sync:tmdb:catalog` with broader discover genre filters for horror-adjacent ingestion.');
    lines.push('- Re-run `npm run seed:season1:subgenres` to attach newly imported films to nodes.');
    await writeFile(READINESS_PATH, `${lines.join('\n')}\n`, 'utf8');

    console.log(
      `Season 1 required subgenre seed complete: nodes=${summaries.length} requested=${totalRequested} assigned=${totalAssigned} unresolved=${unresolved.length}`,
    );
    console.log(`Readiness report updated: ${READINESS_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 required subgenre seed failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
