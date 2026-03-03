import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

const addNodeMovieSchema = z.object({
  nodeId: z.string().min(1, 'nodeId is required'),
  tmdbId: z.number().int().positive('tmdbId must be a positive integer'),
  rank: z.number().int().positive('rank must be a positive integer').optional(),
});

type TmdbMovieDetailsPayload = {
  id?: number;
  title?: string;
  poster_path?: string | null;
  release_date?: string;
  genres?: Array<{ name?: string }>;
  vote_average?: number;
  credits?: {
    cast?: Array<{ name?: string; character?: string }>;
    crew?: Array<{ job?: string; name?: string }>;
  };
};

function parseYear(input?: string): number | undefined {
  if (!input || input.length < 4) {
    return undefined;
  }
  const parsed = Number.parseInt(input.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeGenres(genres: TmdbMovieDetailsPayload['genres']): string[] {
  return (genres ?? [])
    .map((entry) => (typeof entry?.name === 'string' ? entry.name.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);
}

function buildCastTop(credits: TmdbMovieDetailsPayload['credits']): Array<{ name: string; role: string }> {
  return (credits?.cast ?? [])
    .map((entry) => {
      const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
      const role = typeof entry?.character === 'string' ? entry.character.trim() : '';
      if (!name) {
        return null;
      }
      return { name, role: role || 'Unknown' };
    })
    .filter((entry): entry is { name: string; role: string } => entry !== null)
    .slice(0, 6);
}

function resolveDirector(credits: TmdbMovieDetailsPayload['credits']): string | null {
  const director = (credits?.crew ?? []).find((member) => member?.job === 'Director');
  if (!director?.name || typeof director.name !== 'string') {
    return null;
  }
  return director.name.trim() || null;
}

async function fetchTmdbMovieDetails(tmdbId: number): Promise<TmdbMovieDetailsPayload | null> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return null;
  }

  const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  detailsUrl.searchParams.set('api_key', tmdbApiKey);
  detailsUrl.searchParams.set('language', 'en-US');
  detailsUrl.searchParams.set('append_to_response', 'credits');

  const response = await fetch(detailsUrl.toString(), { method: 'GET' });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as TmdbMovieDetailsPayload;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const body = await request.json().catch(() => null);
  const parsed = addNodeMovieSchema.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' }, 400);
  }

  const node = await prisma.journeyNode.findUnique({
    where: { id: parsed.data.nodeId },
    select: {
      id: true,
      movies: {
        orderBy: { rank: 'desc' },
        take: 1,
        select: { rank: true },
      },
    },
  });

  if (!node) {
    return fail({ code: 'NOT_FOUND', message: 'Journey node not found' }, 404);
  }

  let movie = await prisma.movie.findUnique({
    where: { tmdbId: parsed.data.tmdbId },
    select: { id: true, tmdbId: true, title: true },
  });

  if (!movie) {
    const tmdbDetails = await fetchTmdbMovieDetails(parsed.data.tmdbId);
    if (!tmdbDetails || typeof tmdbDetails.title !== 'string' || tmdbDetails.title.trim().length === 0) {
      return fail({ code: 'NOT_FOUND', message: 'Movie not found locally and TMDB details could not be resolved' }, 404);
    }

    const created = await prisma.movie.upsert({
      where: { tmdbId: parsed.data.tmdbId },
      create: {
        tmdbId: parsed.data.tmdbId,
        title: tmdbDetails.title.trim(),
        year: parseYear(tmdbDetails.release_date),
        posterUrl: tmdbDetails.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdbDetails.poster_path}`
          : `/api/posters/${parsed.data.tmdbId}`,
        genres: normalizeGenres(tmdbDetails.genres),
        director: resolveDirector(tmdbDetails.credits),
        castTop: buildCastTop(tmdbDetails.credits),
      },
      update: {
        title: tmdbDetails.title.trim(),
        year: parseYear(tmdbDetails.release_date),
        posterUrl: tmdbDetails.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdbDetails.poster_path}`
          : `/api/posters/${parsed.data.tmdbId}`,
        genres: normalizeGenres(tmdbDetails.genres),
        director: resolveDirector(tmdbDetails.credits),
        castTop: buildCastTop(tmdbDetails.credits),
      },
      select: { id: true, tmdbId: true, title: true },
    });

    if (typeof tmdbDetails.vote_average === 'number' && Number.isFinite(tmdbDetails.vote_average)) {
      await prisma.movieRating.upsert({
        where: { movieId_source: { movieId: created.id, source: 'TMDB' } },
        create: {
          movieId: created.id,
          source: 'TMDB',
          value: tmdbDetails.vote_average,
          scale: '10',
          rawValue: `${tmdbDetails.vote_average}/10`,
        },
        update: {
          value: tmdbDetails.vote_average,
          scale: '10',
          rawValue: `${tmdbDetails.vote_average}/10`,
        },
      });
    }

    movie = created;
  }

  const rank = parsed.data.rank ?? ((node.movies[0]?.rank ?? 0) + 1);

  try {
    const assignment = await prisma.nodeMovie.create({
      data: {
        nodeId: node.id,
        movieId: movie.id,
        rank,
      },
      select: {
        id: true,
        rank: true,
        movie: {
          select: {
            tmdbId: true,
            title: true,
          },
        },
      },
    });
    return ok({
      id: assignment.id,
      nodeId: node.id,
      rank: assignment.rank,
      tmdbId: assignment.movie.tmdbId,
      title: assignment.movie.title,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail({ code: 'ALREADY_ASSIGNED', message: 'Movie is already assigned to this node' }, 409);
    }
    throw error;
  }
}

