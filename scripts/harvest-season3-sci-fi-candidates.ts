import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getSeason3SciFiDiscoverPlans,
  SEASON3_DISCOVERY_SCORE_WEIGHT_BY_PLAN_KEY,
  type DiscoverPlan,
} from '../src/lib/seasons/season3/sci-fi-discovery-profile.ts';

type TmdbDiscoverMovie = {
  id?: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  genre_ids?: number[];
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  original_language?: string;
};

type TmdbDiscoverResponse = {
  page?: number;
  total_pages?: number;
  results?: TmdbDiscoverMovie[];
};

type Candidate = {
  tmdbId: number;
  title: string;
  year: number | null;
  originalTitle: string | null;
  originalLanguage: string | null;
  genreIds: number[];
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  overview: string | null;
  discoveryKeys: string[];
  discoveryReasons: string[];
  discoveryScore: number;
};

type HarvestReport = {
  generatedAt: string;
  seasonSlug: 'season-3';
  packSlug: 'sci-fi';
  yearStart: number;
  yearEnd: number;
  maxPagesPerPlan: number;
  shortlistSize: number;
  totals: {
    uniqueCandidates: number;
    shortlistCount: number;
  };
  plans: Array<{
    key: string;
    label: string;
    slicesScanned: number;
    scannedPages: number;
    totalPagesObserved: number;
    insertedNewCandidates: number;
  }>;
};

const FULL_OUTPUT_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-candidates-full.json');
const SHORTLIST_OUTPUT_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-candidates-shortlist.json');
const REPORT_OUTPUT_PATH = path.resolve('docs', 'season', 'season-3-sci-fi-candidates-report.md');
const TMDB_DISCOVER_MAX_PAGE = 500;

type YearSlice = {
  start: number;
  end: number;
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getYear(releaseDate?: string): number | null {
  if (!releaseDate || releaseDate.length < 4) return null;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

async function fetchDiscoverPage(input: {
  apiKey: string;
  page: number;
  plan: DiscoverPlan;
  yearStart: number;
  yearEnd: number;
}): Promise<TmdbDiscoverResponse> {
  const url = new URL('https://api.themoviedb.org/3/discover/movie');
  url.searchParams.set('api_key', input.apiKey);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('include_video', 'false');
  url.searchParams.set('sort_by', input.plan.sortBy);
  url.searchParams.set('page', String(input.page));
  url.searchParams.set('vote_count.gte', String(input.plan.voteCountGte));
  url.searchParams.set('primary_release_date.gte', `${input.yearStart}-01-01`);
  url.searchParams.set('primary_release_date.lte', `${input.yearEnd}-12-31`);
  url.searchParams.set('with_genres', input.plan.withGenres.join('|'));
  if (input.plan.withoutGenres && input.plan.withoutGenres.length > 0) {
    url.searchParams.set('without_genres', input.plan.withoutGenres.join('|'));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`discover ${input.plan.key} page=${input.page} failed status=${response.status}`);
  }
  return response.json() as Promise<TmdbDiscoverResponse>;
}

function buildYearSlices(yearStart: number, yearEnd: number): YearSlice[] {
  const slices: YearSlice[] = [];
  // Broad historical coverage.
  for (let start = yearStart; start <= yearEnd; start += 10) {
    const end = Math.min(yearEnd, start + 9);
    slices.push({ start, end });
  }
  // Add fine-grained recent slices to capture contemporary releases better.
  const recentStart = Math.max(yearStart, yearEnd - 6);
  for (let year = recentStart; year <= yearEnd; year += 1) {
    slices.push({ start: year, end: year });
  }
  return slices;
}

function scoreCandidate(movie: Candidate): number {
  const voteCount = movie.voteCount ?? 0;
  const voteAverage = movie.voteAverage ?? 0;
  const popularity = movie.popularity ?? 0;
  const discoveryPlanWeight = movie.discoveryKeys
    .map((key) => SEASON3_DISCOVERY_SCORE_WEIGHT_BY_PLAN_KEY[key] ?? 0)
    .reduce((sum, weight) => sum + weight, 0);
  const vintageBonus = movie.year && movie.year < 2000 ? 2 : movie.year && movie.year < 2010 ? 1 : 0;

  let score = 0;
  score += Math.min(12, Math.log10(Math.max(1, voteCount)) * 3.4);
  score += Math.max(0, voteAverage - 5);
  score += Math.min(2, popularity / 40);
  score += discoveryPlanWeight;
  score += vintageBonus;
  return Number(score.toFixed(2));
}

function toCandidate(movie: TmdbDiscoverMovie, plan: DiscoverPlan): Candidate | null {
  if (!Number.isInteger(movie.id) || !movie.title?.trim()) {
    return null;
  }
  return {
    tmdbId: movie.id as number,
    title: movie.title.trim(),
    year: getYear(movie.release_date),
    originalTitle: movie.original_title?.trim() || null,
    originalLanguage: movie.original_language?.trim() || null,
    genreIds: Array.isArray(movie.genre_ids) ? movie.genre_ids.filter((id) => Number.isInteger(id)) : [],
    popularity: typeof movie.popularity === 'number' ? movie.popularity : null,
    voteAverage: typeof movie.vote_average === 'number' ? movie.vote_average : null,
    voteCount: typeof movie.vote_count === 'number' ? movie.vote_count : null,
    overview: typeof movie.overview === 'string' && movie.overview.trim().length > 0 ? movie.overview.trim() : null,
    discoveryKeys: [plan.key],
    discoveryReasons: [plan.label],
    discoveryScore: 0,
  };
}

function renderReport(report: HarvestReport): string {
  const lines: string[] = [];
  lines.push('# Season 3 Sci-Fi Candidate Harvest Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Season/Pack: ${report.seasonSlug}/${report.packSlug}`);
  lines.push(`Window: ${report.yearStart}-${report.yearEnd}`);
  lines.push(`Max pages per plan (effective): ${report.maxPagesPerPlan}`);
  lines.push('Pagination strategy: segmented year windows (TMDB hard-cap is 500 pages per query).');
  lines.push(`Unique candidates: ${report.totals.uniqueCandidates}`);
  lines.push(`Shortlist size: ${report.totals.shortlistCount}`);
  lines.push('');
  lines.push('## Discover Plans');
  lines.push('');
  lines.push('| Key | Label | Slices | Pages | Total Pages Seen | New Candidates |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const plan of report.plans) {
    lines.push(`| ${plan.key} | ${plan.label} | ${plan.slicesScanned} | ${plan.scannedPages} | ${plan.totalPagesObserved} | ${plan.insertedNewCandidates} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is required');
  }

  const yearStart = parseIntEnv('SEASON3_DISCOVER_YEAR_START', 1920);
  const yearEnd = parseIntEnv('SEASON3_DISCOVER_YEAR_END', new Date().getUTCFullYear());
  const maxPagesPerPlan = parseIntEnv('SEASON3_DISCOVER_MAX_PAGES', 2000);
  const shortlistSize = parseIntEnv('SEASON3_SHORTLIST_SIZE', 1200);

  const plans = getSeason3SciFiDiscoverPlans();
  const candidateByTmdbId = new Map<number, Candidate>();
  const planStats: HarvestReport['plans'] = [];

  const yearSlices = buildYearSlices(yearStart, yearEnd);
  for (const plan of plans) {
    let slicesScanned = 0;
    let scannedPages = 0;
    let totalPagesObserved = 0;
    let insertedNewCandidates = 0;

    let remainingPages = maxPagesPerPlan;
    for (const slice of yearSlices) {
      if (remainingPages <= 0) {
        break;
      }
      slicesScanned += 1;
      const perSliceCap = Math.min(remainingPages, TMDB_DISCOVER_MAX_PAGE);
      for (let page = 1; page <= perSliceCap; page += 1) {
        let payload: TmdbDiscoverResponse;
        try {
          // eslint-disable-next-line no-await-in-loop
          payload = await fetchDiscoverPage({
            apiKey,
            page,
            plan,
            yearStart: slice.start,
            yearEnd: slice.end,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (
            message.includes('status=400')
            || message.includes('status=422')
            || message.includes('status=429')
            || message.includes('status=500')
            || message.includes('status=502')
            || message.includes('status=503')
            || message.includes('status=504')
          ) {
            break;
          }
          throw error;
        }
        scannedPages += 1;
        remainingPages -= 1;
        totalPagesObserved += payload.total_pages ?? 0;
        const results = Array.isArray(payload.results) ? payload.results : [];
        if (results.length === 0) {
          break;
        }

        for (const result of results) {
          const candidate = toCandidate(result, plan);
          if (!candidate) {
            continue;
          }
          const existing = candidateByTmdbId.get(candidate.tmdbId);
          if (!existing) {
            candidateByTmdbId.set(candidate.tmdbId, candidate);
            insertedNewCandidates += 1;
            continue;
          }

          if (!existing.discoveryKeys.includes(plan.key)) {
            existing.discoveryKeys.push(plan.key);
          }
          if (!existing.discoveryReasons.includes(plan.label)) {
            existing.discoveryReasons.push(plan.label);
          }
          if ((existing.voteCount ?? 0) < (candidate.voteCount ?? 0)) {
            existing.voteCount = candidate.voteCount;
          }
          if ((existing.popularity ?? 0) < (candidate.popularity ?? 0)) {
            existing.popularity = candidate.popularity;
          }
          if ((existing.voteAverage ?? 0) < (candidate.voteAverage ?? 0)) {
            existing.voteAverage = candidate.voteAverage;
          }
          if (!existing.overview && candidate.overview) {
            existing.overview = candidate.overview;
          }
        }

        if (payload.total_pages && page >= payload.total_pages) {
          break;
        }
      }
    }

    planStats.push({
      key: plan.key,
      label: plan.label,
      slicesScanned,
      scannedPages,
      totalPagesObserved,
      insertedNewCandidates,
    });
  }

  const allCandidates = [...candidateByTmdbId.values()]
    .map((candidate) => {
      candidate.discoveryScore = scoreCandidate(candidate);
      return candidate;
    })
    .sort((a, b) =>
      b.discoveryScore - a.discoveryScore
      || (b.voteCount ?? 0) - (a.voteCount ?? 0)
      || normalizeTitle(a.title).localeCompare(normalizeTitle(b.title)));

  const shortlist = allCandidates.slice(0, shortlistSize);
  const report: HarvestReport = {
    generatedAt: new Date().toISOString(),
    seasonSlug: 'season-3',
    packSlug: 'sci-fi',
    yearStart,
    yearEnd,
    maxPagesPerPlan,
    shortlistSize,
    totals: {
      uniqueCandidates: allCandidates.length,
      shortlistCount: shortlist.length,
    },
    plans: planStats,
  };

  await fs.mkdir(path.dirname(FULL_OUTPUT_PATH), { recursive: true });
  await Promise.all([
    fs.writeFile(FULL_OUTPUT_PATH, `${JSON.stringify({ ...report, candidates: allCandidates }, null, 2)}\n`, 'utf8'),
    fs.writeFile(SHORTLIST_OUTPUT_PATH, `${JSON.stringify({ ...report, candidates: shortlist }, null, 2)}\n`, 'utf8'),
    fs.writeFile(REPORT_OUTPUT_PATH, `${renderReport(report)}\n`, 'utf8'),
  ]);

  console.log(`[harvest-season3-sci-fi-candidates] wrote ${FULL_OUTPUT_PATH}`);
  console.log(`[harvest-season3-sci-fi-candidates] wrote ${SHORTLIST_OUTPUT_PATH}`);
  console.log(`[harvest-season3-sci-fi-candidates] wrote ${REPORT_OUTPUT_PATH}`);
  console.log(`[harvest-season3-sci-fi-candidates] unique=${allCandidates.length} shortlist=${shortlist.length}`);
}

void main().catch((error) => {
  console.error('[harvest-season3-sci-fi-candidates] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
