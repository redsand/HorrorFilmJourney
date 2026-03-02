import { InteractionStatus, PrismaClient } from '@prisma/client';
import type { RecommendationCardNarrative } from '@/lib/contracts/narrative-contracts';
import type { EvidencePacketVM, EvidenceRetriever } from '@/lib/evidence/evidence-retriever';
import {
  buildNarrative,
  generateRecommendationBatchV1,
  normalizeGenres,
  pickDiverseMovies,
  type CandidateMovie,
  type RecommendationBatchResult,
  type RecommendationEngineOptions,
} from '@/lib/recommendation/recommendation-engine-v1';
import { DeterministicStubStreamingProvider } from '@/lib/streaming/streaming-provider';
import { StreamingLookupService } from '@/lib/streaming/streaming-lookup-service';

type RatingBundle = CandidateMovie['ratings'];

function toRatings(
  ratings: Array<{ source: string; value: number; scale: string; rawValue: string | null }>,
): RatingBundle | null {
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

export type CandidateMovieId = string;
export type RankedMovieId = string;

export type CandidateConstraints = {
  targetCount: number;
  excludeRecentSkippedDays: number;
};

export type RecommendationContext = {
  targetCount: number;
};

export type ExplorationContext = {
  enabled?: boolean;
};

export type ExplorationResult = {
  finalRankedIds: RankedMovieId[];
  explorationUsed: boolean;
};

export interface CandidateGenerator {
  generateCandidates(userId: string, constraints: CandidateConstraints): Promise<CandidateMovieId[]>;
}

export interface Reranker {
  rerank(userId: string, candidateIds: CandidateMovieId[], context: RecommendationContext): Promise<RankedMovieId[]>;
}

export interface ExplorationPolicy {
  chooseExploration(rankedIds: RankedMovieId[], userProfile: unknown, context: ExplorationContext): Promise<ExplorationResult>;
}

export interface NarrativeComposer {
  compose(
    movie: CandidateMovie,
    userProfile: unknown,
    journeyNode: string,
    evidencePackets: EvidencePacketVM[],
  ): RecommendationCardNarrative;
}

export class SqlCandidateGeneratorV1 implements CandidateGenerator {
  constructor(private readonly prisma: PrismaClient) {}

  async generateCandidates(userId: string, constraints: CandidateConstraints): Promise<CandidateMovieId[]> {
    const skipCutoff = new Date(Date.now() - constraints.excludeRecentSkippedDays * 24 * 60 * 60 * 1000);
    const seenInteractions = await this.prisma.userMovieInteraction.findMany({
      where: {
        userId,
        OR: [
          { status: InteractionStatus.WATCHED },
          { status: InteractionStatus.ALREADY_SEEN },
          { status: InteractionStatus.SKIPPED, createdAt: { gte: skipCutoff } },
        ],
      },
      select: { movieId: true },
    });

    const excludedMovieIds = new Set(seenInteractions.map((item) => item.movieId));
    const allMovies = await this.prisma.movie.findMany({
      orderBy: { tmdbId: 'asc' },
      select: { id: true, posterUrl: true, ratings: { select: { source: true } } },
    });
    return allMovies
      .filter((movie) => !excludedMovieIds.has(movie.id))
      .filter((movie) => movie.posterUrl.trim().length > 0)
      .filter((movie) => movie.ratings.length >= 2 && movie.ratings.some((rating) => rating.source === 'IMDB'))
      .map((movie) => movie.id);
  }
}

export class HeuristicRerankerV1 implements Reranker {
  constructor(private readonly prisma: PrismaClient) {}

  async rerank(_userId: string, candidateIds: CandidateMovieId[], context: RecommendationContext): Promise<RankedMovieId[]> {
    const movies = await this.prisma.movie.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, tmdbId: true, title: true, year: true, posterUrl: true, genres: true, ratings: { select: { source: true, value: true, scale: true, rawValue: true } } },
    });
    const mapped: CandidateMovie[] = movies
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

    return pickDiverseMovies(mapped, context.targetCount).map((movie) => movie.id);
  }
}

export class NoExplorationPolicyV1 implements ExplorationPolicy {
  async chooseExploration(rankedIds: RankedMovieId[]): Promise<ExplorationResult> {
    return { finalRankedIds: rankedIds, explorationUsed: false };
  }
}

export class CachedEvidenceRetrieverV1 implements EvidenceRetriever {
  constructor(private readonly prisma: PrismaClient) {}

  async getEvidence(movieId: string): Promise<Array<{ sourceName: string; url?: string; snippet: string; retrievedAt: string }>> {
    const evidence = await this.prisma.evidencePacket.findMany({ where: { movieId }, orderBy: { retrievedAt: 'desc' } });
    return evidence.map((item) => ({
      sourceName: item.sourceName,
      ...(item.url ? { url: item.url } : {}),
      snippet: item.snippet,
      retrievedAt: item.retrievedAt.toISOString(),
    }));
  }
}

export class TemplateNarrativeComposerV1 implements NarrativeComposer {
  compose(movie: CandidateMovie, _userProfile: unknown, journeyNode: string): RecommendationCardNarrative {
    const rankMatch = journeyNode.match(/RANK_(\d+)$/);
    const rank = rankMatch ? Number(rankMatch[1]) : 1;
    return buildNarrative(movie, rank);
  }
}

export type RecommendationEngineDeps = {
  candidateGenerator: CandidateGenerator;
  reranker: Reranker;
  explorationPolicy: ExplorationPolicy;
  evidenceRetriever: EvidenceRetriever;
  narrativeComposer: NarrativeComposer;
};

const DEFAULT_TARGET_COUNT = 5;
const DEFAULT_SKIP_DAYS = 30;

export async function generateRecommendationBatchModern(
  userId: string,
  prisma: PrismaClient,
  deps: RecommendationEngineDeps,
  options: RecommendationEngineOptions = {},
): Promise<RecommendationBatchResult> {
  const targetCount = options.targetCount ?? DEFAULT_TARGET_COUNT;
  const excludeRecentSkippedDays = options.excludeRecentSkippedDays ?? DEFAULT_SKIP_DAYS;

  const [excludedSeenCount, excludedSkippedRecentCount, allMovieCount] = await Promise.all([
    prisma.userMovieInteraction.count({ where: { userId, status: { in: [InteractionStatus.WATCHED, InteractionStatus.ALREADY_SEEN] } } }),
    prisma.userMovieInteraction.count({
      where: {
        userId,
        status: InteractionStatus.SKIPPED,
        createdAt: { gte: new Date(Date.now() - excludeRecentSkippedDays * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.movie.count(),
  ]);

  const candidateIds = await deps.candidateGenerator.generateCandidates(userId, { targetCount, excludeRecentSkippedDays });
  const rankedIds = await deps.reranker.rerank(userId, candidateIds, { targetCount });
  const exploration = await deps.explorationPolicy.chooseExploration(rankedIds, null, {});

  const selectedIds = exploration.finalRankedIds.slice(0, targetCount);
  const movies = await prisma.movie.findMany({
    where: { id: { in: selectedIds } },
    select: { id: true, tmdbId: true, title: true, year: true, posterUrl: true, genres: true, ratings: { select: { source: true, value: true, scale: true, rawValue: true } } },
  });
  const movieById = new Map(
    movies
      .map((movie) => {
        const ratings = toRatings(movie.ratings);
        if (!ratings) {
          return null;
        }

        return [
          movie.id,
          {
            id: movie.id,
            tmdbId: movie.tmdbId,
            title: movie.title,
            year: movie.year,
            posterUrl: movie.posterUrl,
            genres: normalizeGenres(movie.genres),
            ratings,
          } satisfies CandidateMovie,
        ] as const;
      })
      .filter((entry): entry is readonly [string, CandidateMovie] => Boolean(entry)),
  );

  const orderedMovies = selectedIds.map((id) => movieById.get(id)).filter((movie): movie is CandidateMovie => Boolean(movie));
  const streamingLookup = new StreamingLookupService(prisma, new DeterministicStubStreamingProvider());
  const streamingByMovieId = new Map(
    await Promise.all(
      orderedMovies.map(async (movie) => {
        const streaming = await streamingLookup.getForMovie(movie);
        return [movie.id, streaming.offers] as const;
      }),
    ),
  );

  const itemData = await Promise.all(
    orderedMovies.map(async (movie, index) => {
      const rank = index + 1;
      const evidence = await deps.evidenceRetriever.getEvidence(movie.id);
      const narrative = deps.narrativeComposer.compose(movie, null, `ENGINE_V1_CORE#RANK_${rank}`, evidence);
      return { movie, rank, narrative, evidence };
    }),
  );

  const batch = await prisma.recommendationBatch.create({
    data: {
      userId,
      journeyNode: 'ENGINE_V1_CORE',
      rationale: 'modern pipeline: interface-composed v1 adapters',
      items: {
        create: itemData.map((item) => ({
          movieId: item.movie.id,
          rank: item.rank,
          whyImportant: item.narrative.whyImportant,
          whatItTeaches: item.narrative.whatItTeaches,
          historicalContext: item.narrative.historicalContext,
          nextStepHint: item.narrative.nextStepHint,
          watchFor: item.narrative.watchFor,
          reception: item.narrative.reception,
          castHighlights: item.narrative.castHighlights,
          streaming: streamingByMovieId.get(item.movie.id) ?? [],
          spoilerPolicy: item.narrative.spoilerPolicy,
        })),
      },
    },
    include: {
      items: {
        orderBy: { rank: 'asc' },
        include: { movie: { include: { ratings: { select: { source: true, value: true, scale: true, rawValue: true } } } } },
      },
    },
  });

  await prisma.recommendationDiagnostics.create({
    data: {
      batchId: batch.id,
      candidateCount: candidateIds.length,
      excludedSeenCount,
      excludedSkippedRecentCount,
      diversityStats: {
        candidatePool: allMovieCount,
        selectedCount: orderedMovies.length,
      },
      explorationUsed: exploration.explorationUsed,
      notes: 'modern mode diagnostics',
    },
  });

  return {
    batchId: batch.id,
    cards: batch.items.map((item) => ({
      id: item.id,
      rank: item.rank,
      movie: {
        id: item.movie.id,
        tmdbId: item.movie.tmdbId,
        title: item.movie.title,
        year: item.movie.year,
        posterUrl: item.movie.posterUrl,
        genres: normalizeGenres(item.movie.genres),
        ratings: toRatings(item.movie.ratings)!,
      },
      narrative: {
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
      },
      ratings: toRatings(item.movie.ratings)!,
      evidence: itemData.find((entry) => entry.movie.id === item.movie.id)?.evidence ?? [],
    })),
  };
}

export async function generateRecommendationBatch(
  userId: string,
  prisma: PrismaClient,
  options: RecommendationEngineOptions = {},
): Promise<RecommendationBatchResult> {
  const mode = process.env.REC_ENGINE_MODE === 'modern' ? 'modern' : 'v1';
  if (mode === 'v1') {
    return generateRecommendationBatchV1(userId, prisma, options);
  }

  return generateRecommendationBatchModern(
    userId,
    prisma,
    {
      candidateGenerator: new SqlCandidateGeneratorV1(prisma),
      reranker: new HeuristicRerankerV1(prisma),
      explorationPolicy: new NoExplorationPolicyV1(),
      evidenceRetriever: new CachedEvidenceRetrieverV1(prisma),
      narrativeComposer: new TemplateNarrativeComposerV1(),
    },
    options,
  );
}
