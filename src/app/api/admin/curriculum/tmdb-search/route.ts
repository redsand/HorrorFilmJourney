import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

type TmdbSearchPayload = {
  results?: Array<{
    id?: number;
    title?: string;
    release_date?: string;
    poster_path?: string | null;
    overview?: string;
  }>;
};

function toLimit(raw: string | null): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value) || value < 1) {
    return 10;
  }
  return Math.min(value, 20);
}

function extractYear(releaseDate?: string): number | null {
  if (!releaseDate || releaseDate.length < 4) {
    return null;
  }
  const parsed = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const limit = toLimit(url.searchParams.get('limit'));

  if (query.length < 2) {
    return ok({ items: [] as Array<unknown> }, { status: 200 });
  }

  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return fail({ code: 'TMDB_NOT_CONFIGURED', message: 'TMDB_API_KEY is required for admin TMDB search' }, 503);
  }

  const searchUrl = new URL('https://api.themoviedb.org/3/search/movie');
  searchUrl.searchParams.set('api_key', tmdbApiKey);
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('include_adult', 'false');
  searchUrl.searchParams.set('language', 'en-US');
  searchUrl.searchParams.set('page', '1');

  const response = await fetch(searchUrl.toString(), { method: 'GET' });
  if (!response.ok) {
    return fail({ code: 'TMDB_UNAVAILABLE', message: `TMDB search failed with status ${response.status}` }, 502);
  }

  const payload = (await response.json()) as TmdbSearchPayload;
  const items = (payload.results ?? [])
    .filter((item) => Number.isInteger(item.id) && typeof item.title === 'string' && item.title.trim().length > 0)
    .slice(0, limit)
    .map((item) => ({
      tmdbId: item.id as number,
      title: (item.title as string).trim(),
      year: extractYear(item.release_date),
      posterUrl: item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : `/api/posters/${item.id as number}`,
      overview: typeof item.overview === 'string' ? item.overview : '',
    }));

  return ok({ items }, { status: 200 });
}

