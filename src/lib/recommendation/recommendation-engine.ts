import { InteractionStatus, PrismaClient } from '@prisma/client';
import { getLlmProviderFromEnv } from '@/ai';
import { LlmSchemaError, type LlmProvider } from '@/ai/llmProvider';
import type { RecommendationCardNarrative } from '@/lib/contracts/narrative-contracts';
import { recommendationCardNarrativeSchema } from '@/lib/contracts/narrative-contracts';
import type { EvidencePacketVM, EvidenceRetriever } from '@/lib/evidence/evidence-retriever';
import { packageEvidencePackets } from '@/lib/evidence/evidence-packager';
import {
  buildNarrative,
  generateRecommendationBatchV1,
  isRecommendationEligibleMovie,
  MIN_RATING_SOURCES_FOR_ELIGIBILITY,
  normalizeGenres,
  pickDiverseMovies,
  type CandidateMovie,
  type RecommendationBatchResult,
  type RecommendationEngineOptions,
} from '@/lib/recommendation/recommendation-engine-v1';
import { DeterministicStubStreamingProvider } from '@/lib/streaming/streaming-provider';
import { StreamingLookupService } from '@/lib/streaming/streaming-lookup-service';
import {
  computeEvidenceHashes,
  computeNarrativeHash,
  getCachedNarrativeIfFresh,
  NARRATIVE_VERSION,
} from '@/lib/recommendation/narrative-cache';

type RatingBundle = CandidateMovie['ratings'];

function toRatings(
  ratings: Array<{ source: string; value: number; scale: string; rawValue: string | null }>,
): RatingBundle | null {
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
  ): Promise<RecommendationCardNarrative>;
}

const RECOMMENDATION_CARD_NARRATIVE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'whyImportant',
    'whatItTeaches',
    'watchFor',
    'historicalContext',
    'reception',
    'castHighlights',
    'streaming',
    'spoilerPolicy',
    'journeyNode',
    'nextStepHint',
    'ratings',
  ],
  properties: {
    whyImportant: { type: 'string' },
    whatItTeaches: { type: 'string' },
    watchFor: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
    historicalContext: { type: 'string' },
    reception: {
      type: 'object',
      additionalProperties: false,
      properties: {
        critics: { type: 'number' },
        audience: { type: 'number' },
        summary: { type: 'string' },
      },
    },
    castHighlights: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
        },
      },
    },
    streaming: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['provider', 'type'],
        properties: {
          provider: { type: 'string' },
          type: { type: 'string', enum: ['subscription', 'rent', 'buy', 'free'] },
          url: { type: 'string' },
          price: { type: 'string' },
        },
      },
    },
    spoilerPolicy: { type: 'string', enum: ['NO_SPOILERS', 'LIGHT', 'FULL'] },
    journeyNode: { type: 'string' },
    nextStepHint: { type: 'string' },
    ratings: {
      type: 'object',
      additionalProperties: false,
      required: ['imdb', 'additional'],
      properties: {
        imdb: {
          type: 'object',
          additionalProperties: false,
          required: ['value', 'scale'],
          properties: {
            value: { type: 'number' },
            scale: { type: 'string' },
            rawValue: { type: 'string' },
          },
        },
        additional: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['source', 'value', 'scale'],
            properties: {
              source: { type: 'string' },
              value: { type: 'number' },
              scale: { type: 'string' },
              rawValue: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

function safeUserSignals(userProfile: unknown): { tolerance?: number; pacePreference?: string; recentInteractionSummary?: string } {
  if (!userProfile || typeof userProfile !== 'object') {
    return {};
  }

  const profile = userProfile as Record<string, unknown>;
  return {
    ...(typeof profile.tolerance === 'number' ? { tolerance: profile.tolerance } : {}),
    ...(typeof profile.pacePreference === 'string' ? { pacePreference: profile.pacePreference } : {}),
    ...(typeof profile.recentInteractionSummary === 'string'
      ? { recentInteractionSummary: profile.recentInteractionSummary }
      : {}),
  };
}

function summarizeProfileSignals(userProfile: unknown): string | undefined {
  const signals = safeUserSignals(userProfile);
  const entries = Object.entries(signals);
  if (entries.length === 0) {
    return undefined;
  }

  return entries.map(([key, value]) => `${key}:${String(value)}`).join('|');
}

function rankFromJourneyNode(journeyNode: string): number {
  const rankMatch = journeyNode.match(/RANK_(\d+)$/);
  return rankMatch ? Number(rankMatch[1]) : 1;
}

function extractEvidenceRefs(value: string): string[] {
  return [...value.matchAll(/\[E(\d+)\]/g)].map((match) => `E${match[1]}`);
}

function findInvalidEvidenceRefs(narrative: RecommendationCardNarrative, evidenceCount: number): string[] {
  const referenced = new Set<string>();
  const textFields = [
    narrative.whyImportant,
    narrative.whatItTeaches,
    narrative.historicalContext,
    narrative.nextStepHint,
    ...(typeof narrative.reception.summary === 'string' ? [narrative.reception.summary] : []),
    ...narrative.watchFor,
  ];

  textFields.forEach((text) => {
    extractEvidenceRefs(text).forEach((ref) => referenced.add(ref));
  });

  return [...referenced].filter((ref) => {
    const n = Number(ref.slice(1));
    return !Number.isInteger(n) || n < 1 || n > evidenceCount;
  });
}

export async function composeCardNarrative(input: {
  movie: CandidateMovie;
  userProfile: unknown;
  journeyNode: string;
  evidencePackets: EvidencePacketVM[];
  llmProvider?: LlmProvider;
}): Promise<RecommendationCardNarrative> {
  const rank = rankFromJourneyNode(input.journeyNode);
  const fallback = buildNarrative(input.movie, rank);

  if (!input.llmProvider) {
    return fallback;
  }

  const safeSignals = safeUserSignals(input.userProfile);
  const packagedEvidence = packageEvidencePackets(input.evidencePackets);
  const evidenceSummary = packagedEvidence
    .map((item) => ({
      sourceName: item.sourceName,
      snippet: item.snippet,
      ...(item.url ? { url: item.url } : {}),
    }));

  try {
    const generated = await input.llmProvider.generateJson<unknown>({
      schemaName: 'RecommendationCardNarrative',
      jsonSchema: RECOMMENDATION_CARD_NARRATIVE_JSON_SCHEMA,
      system:
        'Compose concise, accurate recommendation narratives. Return strict JSON only. No markdown. No prose outside JSON.'
        + ' Use NO_SPOILERS by default.'
        + ' Do not claim facts not supported by evidence; if uncertain, write "unknown".'
        + ' For factual claims, add citation hints like [E1], [E2] where E# maps to evidence order.',
      user: JSON.stringify({
        movie: {
          tmdbId: input.movie.tmdbId,
          title: input.movie.title,
          year: input.movie.year,
          genres: input.movie.genres,
          ratings: input.movie.ratings,
        },
        journeyNode: input.journeyNode,
        preferenceSignals: safeSignals,
        evidence: evidenceSummary.map((e, index) => ({ id: `E${index + 1}`, ...e })),
      }),
      temperature: 0.2,
      maxTokens: 900,
    });

    const parsed = recommendationCardNarrativeSchema.safeParse(generated);
    if (!parsed.success) {
      throw new LlmSchemaError(parsed.error.issues[0]?.message ?? 'Narrative does not match RecommendationCardNarrative schema');
    }

    const invalidRefs = findInvalidEvidenceRefs(parsed.data, packagedEvidence.length);
    if (invalidRefs.length > 0) {
      throw new LlmSchemaError(`Narrative contains invalid evidence refs: ${invalidRefs.join(', ')}`);
    }

    return parsed.data;
  } catch {
    return fallback;
  }
}

function resolveNarrativeModel(llmProvider?: LlmProvider): string {
  if (!llmProvider) {
    return 'deterministic-template-v1';
  }

  if (llmProvider.name() === 'gemini') {
    return process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
  }

  if (llmProvider.name() === 'ollama') {
    return process.env.OLLAMA_MODEL ?? 'ollama';
  }

  return llmProvider.name();
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
      .filter((movie) => isRecommendationEligibleMovie({ posterUrl: movie.posterUrl, ratings: movie.ratings }))
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

  async getEvidenceForMovie(movieId: string): Promise<Array<{ sourceName: string; url?: string; snippet: string; retrievedAt: string }>> {
    const evidence = await this.prisma.evidencePacket.findMany({ where: { movieId }, orderBy: { retrievedAt: 'desc' } });
    return packageEvidencePackets(
      evidence.map((item) => ({
      sourceName: item.sourceName,
      ...(item.url ? { url: item.url } : {}),
      snippet: item.snippet,
      retrievedAt: item.retrievedAt.toISOString(),
      })),
    );
  }
}

export class TemplateNarrativeComposerV1 implements NarrativeComposer {
  constructor(private readonly llmProvider?: LlmProvider) {}

  async compose(
    movie: CandidateMovie,
    userProfile: unknown,
    journeyNode: string,
    evidencePackets: EvidencePacketVM[],
  ): Promise<RecommendationCardNarrative> {
    return composeCardNarrative({
      movie,
      userProfile,
      journeyNode,
      evidencePackets,
      llmProvider: this.llmProvider,
    });
  }

  modelName(): string {
    return resolveNarrativeModel(this.llmProvider);
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
      const evidence = await deps.evidenceRetriever.getEvidenceForMovie(movie.id, 'US');
      const journeyNode = `ENGINE_V1_CORE#RANK_${rank}`;
      const ratings = movie.ratings;
      const inputHash = computeNarrativeHash({
        movieFacts: {
          tmdbId: movie.tmdbId,
          title: movie.title,
          year: movie.year,
          genres: movie.genres,
          ratings: movie.ratings,
        },
        journeyNode,
        evidenceHashes: computeEvidenceHashes(evidence),
        profileSummary: summarizeProfileSignals(null),
        narrativeVersion: NARRATIVE_VERSION,
      });

      const cachedItem = await prisma.recommendationItem.findFirst({
        where: { movieId: movie.id, batch: { userId } },
        orderBy: { batch: { createdAt: 'desc' } },
        select: {
          narrativeHash: true,
          narrativeVersion: true,
          whyImportant: true,
          whatItTeaches: true,
          watchFor: true,
          historicalContext: true,
          reception: true,
          castHighlights: true,
          streaming: true,
          spoilerPolicy: true,
          nextStepHint: true,
          narrativeModel: true,
          narrativeGeneratedAt: true,
        },
      });

      const cachedNarrative = getCachedNarrativeIfFresh(cachedItem, inputHash, {
        journeyNode: 'ENGINE_V1_CORE',
        ratings,
        narrativeVersion: NARRATIVE_VERSION,
      });

      if (cachedNarrative) {
        return {
          movie,
          rank,
          evidence,
          narrative: cachedNarrative,
          narrativeHash: inputHash,
          narrativeVersion: cachedItem?.narrativeVersion ?? NARRATIVE_VERSION,
          narrativeModel: cachedItem?.narrativeModel ?? 'deterministic-template-v1',
          narrativeGeneratedAt: cachedItem?.narrativeGeneratedAt ?? new Date(),
        };
      }

      const narrative = await deps.narrativeComposer.compose(movie, null, journeyNode, evidence);
      return {
        movie,
        rank,
        narrative,
        evidence,
        narrativeHash: inputHash,
        narrativeVersion: NARRATIVE_VERSION,
        narrativeModel:
          deps.narrativeComposer instanceof TemplateNarrativeComposerV1
            ? deps.narrativeComposer.modelName()
            : 'narrative-composer',
        narrativeGeneratedAt: new Date(),
      };
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
          narrativeVersion: item.narrativeVersion,
          narrativeModel: item.narrativeModel,
          narrativeHash: item.narrativeHash,
          narrativeGeneratedAt: item.narrativeGeneratedAt,
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
  let llmProvider: LlmProvider | undefined;
  if (process.env.LLM_PROVIDER) {
    try {
      llmProvider = getLlmProviderFromEnv();
    } catch {
      llmProvider = undefined;
    }
  }

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
      narrativeComposer: new TemplateNarrativeComposerV1(llmProvider),
    },
    options,
  );
}
