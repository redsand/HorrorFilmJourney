import { InteractionStatus } from '@prisma/client';
import { fail, ok } from '@/lib/api-envelope';
import { requireAuth } from '@/lib/auth/guards';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/observability/error';

export const dynamic = 'force-dynamic';

type WatchlistItem = {
  interactionId: string;
  createdAt: Date;
  movie: {
    tmdbId: number;
    title: string;
    year: number | null;
    posterUrl: string;
  };
};

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter((item) => item.length > 0);
}

function toInt(raw: string | null, fallback: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return value;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireAuth(request, prisma);
    if (!auth.ok) {
      return fail(auth.error, auth.status);
    }

    const url = new URL(request.url);
    const page = toInt(url.searchParams.get('page'), 1);
    const pageSize = Math.min(toInt(url.searchParams.get('pageSize'), 8), 30);

    const effectivePack = await resolveEffectivePackForUser(prisma, auth.userId);
    const primaryGenre = effectivePack.primaryGenre.trim().toLowerCase();

    const watchlistInteractions = await prisma.userMovieInteraction.findMany({
    where: {
      userId: auth.userId,
      status: InteractionStatus.WANT_TO_WATCH,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      movie: {
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
      },
    },
  });

    const movieIds = Array.from(new Set(watchlistInteractions.map((item) => item.movieId)));
    const latestByMovie = new Map<string, InteractionStatus>();
    if (movieIds.length > 0) {
      const allRecent = await prisma.userMovieInteraction.findMany({
      where: {
        userId: auth.userId,
        movieId: { in: movieIds },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        movieId: true,
        status: true,
      },
    });

      for (const row of allRecent) {
        if (!latestByMovie.has(row.movieId)) {
          latestByMovie.set(row.movieId, row.status);
        }
      }
    }

    const deduped = new Map<string, WatchlistItem>();
    for (const row of watchlistInteractions) {
      if (latestByMovie.get(row.movieId) !== InteractionStatus.WANT_TO_WATCH) {
        continue;
      }
      const inPack = effectivePack.packId
        ? row.movie.nodeAssignments.some((assignment) => assignment.node.packId === effectivePack.packId)
        : parseGenres(row.movie.genres).includes(primaryGenre);
      if (!inPack) {
        continue;
      }
      if (!deduped.has(row.movieId)) {
        deduped.set(row.movieId, {
          interactionId: row.id,
          createdAt: row.createdAt,
          movie: {
            tmdbId: row.movie.tmdbId,
            title: row.movie.title,
            year: row.movie.year ?? null,
            posterUrl: row.movie.posterUrl,
          },
        });
      }
    }

    const items = Array.from(deduped.values());
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const start = (normalizedPage - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    return ok({
      items: paged,
      page: normalizedPage,
      pageSize,
      total,
      totalPages,
      packSlug: effectivePack.packSlug,
    }, { status: 200 });
  } catch (error) {
    await captureError(prisma, {
      route: '/api/watchlist',
      code: 'WATCHLIST_FAILED',
      message: error instanceof Error ? error.message : 'Watchlist failed',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail({ code: 'INTERNAL_ERROR', message: 'Unable to load watchlist' }, 500);
  }
}
