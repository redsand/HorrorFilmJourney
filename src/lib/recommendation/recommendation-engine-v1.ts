import { InteractionStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  recommendationCardNarrativeSchema,
  type RecommendationCardNarrative,
} from '@/lib/contracts/narrative-contracts';

export type CandidateMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string;
  genres: string[];
  ratings: {
    imdb: { value: number; scale: string; rawValue?: string };
    additional: Array<{ source: string; value: number; scale: string; rawValue?: string }>;
  };
};

type RecommendationCard = {
  id: string;
  rank: number;
  movie: CandidateMovie;
  ratings: CandidateMovie['ratings'];
  narrative: RecommendationCardNarrative;
};

export type RecommendationBatchResult = {
  batchId: string;
  cards: RecommendationCard[];
};

export type RecommendationEngineOptions = {
  excludeRecentSkippedDays?: number;
  targetCount?: number;
};

const DEFAULT_TARGET_COUNT = 5;
const DEFAULT_SKIP_DAYS = 30;

export function normalizeGenres(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function decadeOf(year: number | null): number | null {
  if (!year) {
    return null;
  }

  return Math.floor(year / 10) * 10;
}

export function buildNarrative(movie: CandidateMovie, rank: number): RecommendationCardNarrative {
  const watchFor = [
    `How ${movie.title} builds tension scene-by-scene`,
    'A key style choice that shapes mood',
    'One performance beat that pays off late',
  ];

  return recommendationCardNarrativeSchema.parse({
    whyImportant: `${movie.title} expands your horror map with a distinct tone and craft approach.`,
    whatItTeaches: 'How to spot structure, suspense pacing, and genre technique quickly.',
    watchFor,
    historicalContext: movie.year
      ? `Released in ${movie.year}, it reflects genre trends of that era while still feeling useful for modern viewing.`
      : 'A useful genre waypoint that helps connect broader horror trends across eras.',
    reception: {
      summary: 'Included by engine v1 using deterministic template rationale.',
    },
    castHighlights: [],
    streaming: [],
    spoilerPolicy: 'NO_SPOILERS',
    journeyNode: 'ENGINE_V1_CORE',
    nextStepHint: rank < 5 ? 'After this, continue to the next ranked pick in your bundle.' : 'After this, submit a quick poll to refine your next bundle.',
    ratings: movie.ratings,
  });
}

function toRatings(
  ratings: Array<{ source: string; value: number; scale: string; rawValue: string | null }>,
): CandidateMovie['ratings'] | null {
  const imdb = ratings.find((rating) => rating.source === 'IMDB');
  if (!imdb || ratings.length < 2) {
    return null;
  }

  const additional = ratings
    .filter((rating) => rating.source !== 'IMDB')
    .slice(0, 3)
    .map((rating) => ({
      source: rating.source,
      value: rating.value,
      scale: rating.scale,
      ...(rating.rawValue ? { rawValue: rating.rawValue } : {}),
    }));

  if (additional.length < 1) {
    return null;
  }

  return {
    imdb: {
      value: imdb.value,
      scale: imdb.scale,
      ...(imdb.rawValue ? { rawValue: imdb.rawValue } : {}),
    },
    additional,
  };
}

export function pickDiverseMovies(candidates: CandidateMovie[], targetCount: number): CandidateMovie[] {
  const remaining = [...candidates].sort((a, b) => a.tmdbId - b.tmdbId);
  const chosen: CandidateMovie[] = [];

  const usedDecades = new Set<number>();
  const usedGenres = new Set<string>();

  while (remaining.length > 0 && chosen.length < targetCount) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const movie = remaining[index]!;
      const decade = decadeOf(movie.year);
      const uniqueGenres = movie.genres.filter((genre) => !usedGenres.has(genre));

      let score = 0;
      if (decade !== null && !usedDecades.has(decade)) {
        score += 2;
      }
      score += uniqueGenres.length;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const [selected] = remaining.splice(bestIndex, 1);
    if (!selected) {
      break;
    }

    const decade = decadeOf(selected.year);
    if (decade !== null) {
      usedDecades.add(decade);
    }
    selected.genres.forEach((genre) => usedGenres.add(genre));
    chosen.push(selected);
  }

  return chosen;
}

export async function generateRecommendationBatchV1(
  userId: string,
  prisma: PrismaClient,
  options: RecommendationEngineOptions = {},
): Promise<RecommendationBatchResult> {
  const targetCount = options.targetCount ?? DEFAULT_TARGET_COUNT;
  const skipDays = options.excludeRecentSkippedDays ?? DEFAULT_SKIP_DAYS;

  const skipCutoff = new Date(Date.now() - skipDays * 24 * 60 * 60 * 1000);

  const seenInteractions = await prisma.userMovieInteraction.findMany({
    where: {
      userId,
      OR: [
        { status: InteractionStatus.WATCHED },
        { status: InteractionStatus.ALREADY_SEEN },
        {
          status: InteractionStatus.SKIPPED,
          createdAt: {
            gte: skipCutoff,
          },
        },
      ],
    },
    select: {
      movieId: true,
    },
  });

  const excludedMovieIds = new Set(seenInteractions.map((item) => item.movieId));

  const allMovies = await prisma.movie.findMany({
    orderBy: { tmdbId: 'asc' },
    select: {
      id: true,
      tmdbId: true,
      title: true,
      year: true,
      posterUrl: true,
      genres: true,
      ratings: {
        select: { source: true, value: true, scale: true, rawValue: true },
      },
    },
  });

  const candidates = allMovies
    .filter((movie) => !excludedMovieIds.has(movie.id) && movie.posterUrl.trim().length > 0)
    .map((movie) => {
      const ratings = toRatings(movie.ratings);
      if (!ratings) {
        return null;
      }

      return {
        id: movie.id,
        tmdbId: movie.tmdbId,
        title: movie.title,
        year: movie.year,
        posterUrl: movie.posterUrl,
        genres: normalizeGenres(movie.genres),
        ratings,
      };
    })
    .filter((movie): movie is CandidateMovie => movie !== null);

  const selectedMovies = pickDiverseMovies(candidates, targetCount);

  const batch = await prisma.recommendationBatch.create({
    data: {
      userId,
      journeyNode: 'ENGINE_V1_CORE',
      rationale: 'v1 pipeline: candidates -> filters -> diversity -> deterministic narrative',
      items: {
        create: selectedMovies.map((movie, index) => {
          const rank = index + 1;
          const narrative = buildNarrative(movie, rank);

          return {
            movieId: movie.id,
            rank,
            whyImportant: narrative.whyImportant,
            whatItTeaches: narrative.whatItTeaches,
            historicalContext: narrative.historicalContext,
            nextStepHint: narrative.nextStepHint,
            watchFor: narrative.watchFor,
            reception: narrative.reception,
            castHighlights: narrative.castHighlights,
            streaming: narrative.streaming,
            spoilerPolicy: narrative.spoilerPolicy,
          };
        }),
      },
    },
    include: {
      items: {
        orderBy: { rank: 'asc' },
        include: {
          movie: {
            select: {
              id: true,
              tmdbId: true,
              title: true,
              year: true,
              posterUrl: true,
              genres: true,
              ratings: {
                select: { source: true, value: true, scale: true, rawValue: true },
              },
            },
          },
        },
      },
    },
  });

  return {
    batchId: batch.id,
    cards: batch.items.map((item) => {
      const narrative = recommendationCardNarrativeSchema.parse({
        whyImportant: item.whyImportant,
        whatItTeaches: item.whatItTeaches,
        watchFor: normalizeGenres(item.watchFor),
        historicalContext: item.historicalContext,
        reception: item.reception ?? {},
        castHighlights: Array.isArray(item.castHighlights) ? item.castHighlights : [],
        streaming: Array.isArray(item.streaming) ? item.streaming : [],
        spoilerPolicy: item.spoilerPolicy,
        journeyNode: batch.journeyNode ?? 'ENGINE_V1_CORE',
        nextStepHint: item.nextStepHint,
        ratings: toRatings(item.movie.ratings)!,
      });

      return {
        id: item.id,
        rank: item.rank,
        movie: {
          id: item.movie.id,
          tmdbId: item.movie.tmdbId,
          title: item.movie.title,
          year: item.movie.year,
          posterUrl: item.movie.posterUrl,
          genres: normalizeGenres(item.movie.genres),
          ratings: narrative.ratings,
        },
        ratings: narrative.ratings,
        narrative,
      };
    }),
  };
}
