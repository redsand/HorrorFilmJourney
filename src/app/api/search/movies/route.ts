import { InteractionStatus } from '@prisma/client';
import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';

type SearchItem = {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  inWatchlist: boolean;
};

function parseGenres(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter((item) => item.length > 0);
}

function toLimit(raw: string | null): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value) || value < 1) {
    return 8;
  }
  return Math.min(value, 20);
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const limit = toLimit(url.searchParams.get('limit'));

  if (query.length < 1) {
    return ok({ items: [] as SearchItem[], packSlug: 'horror' }, { status: 200 });
  }

  const effectivePack = await resolveEffectivePackForUser(prisma, auth.userId);
  const primaryGenre = effectivePack.primaryGenre.trim().toLowerCase();
  const packScope = effectivePack.packId ? { packId: effectivePack.packId } : {};

  const movies = await prisma.movie.findMany({
    where: {
      title: {
        contains: query,
        mode: 'insensitive',
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      tmdbId: true,
      title: true,
      year: true,
      posterUrl: true,
      genres: true,
      nodeAssignments: {
        select: {
          node: {
            select: {
              packId: true,
            },
          },
        },
      },
    },
    take: 80,
  });

  const filtered = movies
    .filter((movie) => {
      if (effectivePack.packId) {
        return movie.nodeAssignments.some((assignment) => assignment.node.packId === effectivePack.packId);
      }
      return parseGenres(movie.genres).includes(primaryGenre);
    })
    .sort((a, b) => {
      const aPrefix = a.title.toLowerCase().startsWith(query.toLowerCase()) ? 1 : 0;
      const bPrefix = b.title.toLowerCase().startsWith(query.toLowerCase()) ? 1 : 0;
      if (aPrefix !== bPrefix) {
        return bPrefix - aPrefix;
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);

  const movieIds = filtered.map((movie) => movie.id);
  const watchlistEntries = movieIds.length > 0
    ? await prisma.userMovieInteraction.findMany({
      where: {
        userId: auth.userId,
        movieId: { in: movieIds },
        status: InteractionStatus.WANT_TO_WATCH,
        ...packScope,
      },
      select: {
        movieId: true,
      },
    })
    : [];

  const watchlistSet = new Set(watchlistEntries.map((entry) => entry.movieId));
  const items: SearchItem[] = filtered.map((movie) => ({
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.year ?? null,
    posterUrl: movie.posterUrl,
    inWatchlist: watchlistSet.has(movie.id),
  }));

  return ok({
    items,
    packSlug: effectivePack.packSlug,
  }, { status: 200 });
}
