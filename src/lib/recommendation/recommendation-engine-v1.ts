import { InteractionStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  recommendationCardNarrativeSchema,
  type RecommendationCardNarrative,
} from '@/lib/contracts/narrative-contracts';
import {
  DeterministicStubStreamingProvider,
} from '@/lib/streaming/streaming-provider';
import { StreamingLookupService } from '@/lib/streaming/streaming-lookup-service';

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
  evidence: Array<{ sourceName: string; url?: string; snippet: string; retrievedAt: string }>;
};

export type RecommendationBatchResult = {
  batchId: string;
  cards: RecommendationCard[];
};

export type RecommendationEngineOptions = {
  excludeRecentSkippedDays?: number;
  targetCount?: number;
  packPrimaryGenre?: string;
  packId?: string | null;
};

const DEFAULT_TARGET_COUNT = 5;
const DEFAULT_SKIP_DAYS = 30;
export const MIN_RATING_SOURCES_FOR_ELIGIBILITY = 3;

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
  const primaryGenre = movie.genres[0] ?? 'horror';
  const secondaryGenre = movie.genres[1];
  const genreLabel = secondaryGenre ? `${primaryGenre}/${secondaryGenre}` : primaryGenre;
  const additionalRating = movie.ratings.additional[0];
  const ratingSignal = additionalRating?.rawValue
    ? `${additionalRating.source.replaceAll('_', ' ')} ${additionalRating.rawValue}`
    : additionalRating
      ? `${additionalRating.source.replaceAll('_', ' ')} ${additionalRating.value}/${additionalRating.scale}`
      : 'multi-source reception';

  const watchFor = [
    `How ${movie.title} stages ${genreLabel} tension scene-by-scene`,
    `A craft choice that aligns with its ${movie.year ? `${Math.floor(movie.year / 10) * 10}s` : 'era'} horror style`,
    `One character or performance beat that explains its ${ratingSignal} reception`,
  ];

  return recommendationCardNarrativeSchema.parse({
    whyImportant: `${movie.title} broadens your journey with a ${genreLabel} angle and a clear stylistic signature.`,
    whatItTeaches: `How to read pacing, visual language, and tone decisions in ${genreLabel} horror.`,
    watchFor,
    historicalContext: movie.year
      ? `Released in ${movie.year}, it shows how ${genreLabel} conventions evolved in that period and why they still influence modern horror.`
      : 'A useful genre waypoint that helps connect broader horror trends across eras.',
    reception: {
      summary: `Signal check: IMDb ${movie.ratings.imdb.rawValue ?? `${movie.ratings.imdb.value}/${movie.ratings.imdb.scale}`}${additionalRating ? `, ${ratingSignal}` : ''}.`,
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
  if (!imdb || ratings.length < MIN_RATING_SOURCES_FOR_ELIGIBILITY) {
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

  if (additional.length < MIN_RATING_SOURCES_FOR_ELIGIBILITY - 1) {
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

export function isRecommendationEligibleMovie(input: {
  posterUrl: string;
  posterLastValidatedAt?: Date | null;
  ratings: Array<{ source: string }>;
}): boolean {
  const posterUrl = input.posterUrl.trim();
  if (posterUrl.length === 0) {
    return false;
  }
  if (posterUrl.startsWith('/api/posters/')) {
    return false;
  }
  if (process.env.NODE_ENV !== 'test' && !input.posterLastValidatedAt) {
    return false;
  }

  if (input.ratings.length < MIN_RATING_SOURCES_FOR_ELIGIBILITY) {
    return false;
  }

  return input.ratings.some((rating) => rating.source === 'IMDB');
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
  const packPrimaryGenre = (options.packPrimaryGenre ?? 'horror').toLowerCase();

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
  const latestBatch = await prisma.recommendationBatch.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      items: {
        select: { movieId: true },
      },
    },
  });
  latestBatch?.items.forEach((item) => excludedMovieIds.add(item.movieId));

  const allMovies = await prisma.movie.findMany({
    orderBy: { tmdbId: 'asc' },
    select: {
      id: true,
      tmdbId: true,
      title: true,
      year: true,
      posterUrl: true,
      posterLastValidatedAt: true,
      genres: true,
      ratings: {
        select: { source: true, value: true, scale: true, rawValue: true },
      },
    },
  });

  const posterQualityStats = {
    total: allMovies.length,
    validated: allMovies.filter((movie) => Boolean(movie.posterLastValidatedAt)).length,
    fallbackApi: allMovies.filter((movie) => movie.posterUrl.startsWith('/api/posters/')).length,
    tmdbHost: allMovies.filter((movie) => movie.posterUrl.startsWith('https://image.tmdb.org/')).length,
  };
  console.info('[recommendations.engine] v1 poster quality', posterQualityStats);

  const candidates = allMovies
    .filter((movie) => !excludedMovieIds.has(movie.id))
    .filter((movie) => normalizeGenres(movie.genres).map((genre) => genre.toLowerCase()).includes(packPrimaryGenre))
    .filter((movie) => isRecommendationEligibleMovie({
      posterUrl: movie.posterUrl,
      posterLastValidatedAt: movie.posterLastValidatedAt,
      ratings: movie.ratings,
    }))
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
  console.info('[recommendations.engine] v1 selected posters', {
    selectedCount: selectedMovies.length,
    tmdbHost: selectedMovies.filter((movie) => movie.posterUrl.startsWith('https://image.tmdb.org/')).length,
    fallbackApi: selectedMovies.filter((movie) => movie.posterUrl.startsWith('/api/posters/')).length,
    sample: selectedMovies.slice(0, 5).map((movie) => ({ tmdbId: movie.tmdbId, posterUrl: movie.posterUrl })),
  });
  const streamingLookup = new StreamingLookupService(prisma, new DeterministicStubStreamingProvider());
  const streamingByMovieId = new Map(
    await Promise.all(
      selectedMovies.map(async (movie) => {
        const streaming = await streamingLookup.getForMovie(movie);
        return [movie.id, streaming.offers] as const;
      }),
    ),
  );

  const batch = await prisma.recommendationBatch.create({
    data: {
      userId,
      ...(options.packId ? { packId: options.packId } : {}),
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
            streaming: streamingByMovieId.get(movie.id) ?? [],
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



  const evidenceByMovieId = new Map<string, Array<{ sourceName: string; url?: string; snippet: string; retrievedAt: string }>>();
  const evidenceRows = await prisma.evidencePacket.findMany({
    where: { movieId: { in: batch.items.map((item) => item.movie.id) } },
    orderBy: { retrievedAt: 'desc' },
    select: { movieId: true, sourceName: true, url: true, snippet: true, retrievedAt: true },
  });
  for (const row of evidenceRows) {
    const list = evidenceByMovieId.get(row.movieId) ?? [];
    list.push({
      sourceName: row.sourceName,
      ...(row.url ? { url: row.url } : {}),
      snippet: row.snippet,
      retrievedAt: row.retrievedAt.toISOString(),
    });
    evidenceByMovieId.set(row.movieId, list);
  }
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
        streaming: streamingByMovieId.get(item.movie.id) ?? [],
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
        evidence: evidenceByMovieId.get(item.movie.id) ?? [],
      };
    }),
  };
}
