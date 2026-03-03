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
  type CandidateMovie,
  type RecommendationBatchResult,
  type RecommendationEngineOptions,
} from '@/lib/recommendation/recommendation-engine-v1';
import { DeterministicStubStreamingProvider } from '@/lib/streaming/streaming-provider';
import { StreamingLookupService } from '@/lib/streaming/streaming-lookup-service';
import { syncTmdbHorrorCandidates } from '@/lib/tmdb/live-candidate-sync';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import {
  computeEvidenceHashes,
  computeNarrativeHash,
  getCachedNarrativeIfFresh,
  NARRATIVE_VERSION,
} from '@/lib/recommendation/narrative-cache';

type RatingBundle = CandidateMovie['ratings'];
function nowMs(): number {
  return Date.now();
}

function elapsedMs(startedAt: number): number {
  return nowMs() - startedAt;
}

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
  packPrimaryGenre: string;
  packId?: string | null;
  journeyNodeSlug?: string;
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
  getLastRerankDiagnostics?(): RerankDiagnostics | null;
}

type RerankComponentScores = {
  trend: number;
  quality: number;
  confidence: number;
  dnaScore: number;
  novelty: number;
  exploration: number;
};

type PopularityComponentScores = {
  trend: number;
  quality: number;
  confidence: number;
};

type RerankCandidateDiagnostics = {
  tmdbId: number;
  genres: string[];
  modelScore: number;
  components: RerankComponentScores;
};

type RerankDiagnostics = {
  recommendationStyle: RecommendationStyle;
  candidateCount: number;
  selectedCount: number;
  topModelSample: RerankCandidateDiagnostics[];
};

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

function normalizeCastHighlights(value: unknown): Array<{ name: string; role?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.name !== 'string' || record.name.trim().length === 0) {
        return null;
      }

      return {
        name: record.name.trim(),
        ...(typeof record.role === 'string' && record.role.trim().length > 0
          ? { role: record.role.trim() }
          : {}),
      };
    })
    .filter((entry): entry is { name: string; role?: string } => Boolean(entry));
}

function summarizeProfileSignals(userProfile: unknown): string | undefined {
  const signals = safeUserSignals(userProfile);
  const entries = Object.entries(signals);
  if (entries.length === 0) {
    return undefined;
  }

  return entries.map(([key, value]) => `${key}:${String(value)}`).join('|');
}

export function normalizeInteractionSignal(input: {
  status: InteractionStatus;
  rating: number | null;
  recommend: boolean | null;
  recencyWeight: number;
  emotions?: string[];
}): number {
  const statusBase =
    input.status === InteractionStatus.WATCHED ? 0.8
      : input.status === InteractionStatus.ALREADY_SEEN ? 0.6
        : input.status === InteractionStatus.WANT_TO_WATCH ? 0.3
          : -0.7;

  const ratingSignal = typeof input.rating === 'number' ? (input.rating - 3) * 0.25 : 0;
  const recommendSignal = input.recommend === null ? 0 : input.recommend ? 0.3 : -0.3;
  const negativeEmotionSet = new Set([
    'bored',
    'boring',
    'slow',
    'dull',
    'disappointed',
    'frustrated',
    'angry',
    'confused',
    'annoyed',
    'tedious',
    'flat',
    'unengaging',
  ]);
  const positiveEmotionSet = new Set([
    'fun',
    'cathartic',
    'tense',
    'dread',
    'creepy',
    'disturbing',
    'surreal',
    'uneasy',
    'anxious',
  ]);
  const normalizedEmotions = Array.isArray(input.emotions)
    ? input.emotions
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
    : [];
  const negativeHits = normalizedEmotions.filter((emotion) => negativeEmotionSet.has(emotion)).length;
  const positiveHits = normalizedEmotions.filter((emotion) => positiveEmotionSet.has(emotion)).length;
  const emotionSignal = (positiveHits * 0.12) - (negativeHits * 0.28);
  return (statusBase + ratingSignal + recommendSignal + emotionSignal) * input.recencyWeight;
}

function movieDecade(year: number | null): number | null {
  if (!year) {
    return null;
  }
  return Math.floor(year / 10) * 10;
}

function parsePopularityRating(ratings: Array<{ source: string; value: number }>): number {
  const popularity = ratings.find((rating) => rating.source === 'TMDB_POPULARITY');
  if (!popularity || !Number.isFinite(popularity.value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, popularity.value / 100));
}

function normalizeScore(value: number, scale: string): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const parsedScale = Number(scale);
  if (Number.isFinite(parsedScale) && parsedScale > 0) {
    return Math.max(0, Math.min(1, value / parsedScale));
  }
  return Math.max(0, Math.min(1, value / 100));
}

function parseQualityScore(ratings: RatingBundle): number {
  const qualityRatings = [ratings.imdb, ...ratings.additional.filter((rating) => rating.source !== 'TMDB_POPULARITY')];
  if (qualityRatings.length === 0) {
    return 0;
  }
  const normalized = qualityRatings.map((rating) => normalizeScore(rating.value, rating.scale));
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
}

function parseConfidenceScore(ratings: RatingBundle): number {
  const confidenceSourceCount = new Set([
    'IMDB',
    ...ratings.additional
      .filter((rating) => rating.source !== 'TMDB_POPULARITY')
      .map((rating) => rating.source),
  ]).size;
  return Math.max(0, Math.min(1, confidenceSourceCount / 3));
}

function computeBlendedPopularityScore(ratings: RatingBundle): number {
  const trendScore = parsePopularityRating(ratings.additional.map((rating) => ({
    source: rating.source,
    value: rating.value,
  })));
  const qualityScore = parseQualityScore(ratings);
  const confidenceScore = parseConfidenceScore(ratings);
  return (trendScore * 0.55) + (qualityScore * 0.3) + (confidenceScore * 0.15);
}

function computePopularityComponents(ratings: RatingBundle): PopularityComponentScores {
  return {
    trend: parsePopularityRating(ratings.additional.map((rating) => ({
      source: rating.source,
      value: rating.value,
    }))),
    quality: parseQualityScore(ratings),
    confidence: parseConfidenceScore(ratings),
  };
}

type RecommendationStyle = 'diversity' | 'popularity';

function resolveRecommendationStyle(horrorDna: unknown): RecommendationStyle {
  if (!horrorDna || typeof horrorDna !== 'object') {
    return 'diversity';
  }
  const value = (horrorDna as Record<string, unknown>).recommendationStyle;
  if (value === 'popularity' || value === 'diversity') {
    return value;
  }
  return 'diversity';
}

type UserTasteProfileLike = {
  intensityPreference: number;
  pacingPreference: number;
  psychologicalVsSupernatural: number;
  goreTolerance: number;
  ambiguityTolerance: number;
  nostalgiaBias: number;
  auteurAffinity: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function traitMatch(a: number, b: number): number {
  return 1 - Math.abs(clamp01(a) - clamp01(b));
}

function movieIntensityScore(movie: CandidateMovie): number {
  const genres = new Set(movie.genres.map((g) => g.toLowerCase()));
  let score = 0.45;
  if (genres.has('slasher') || genres.has('body-horror') || genres.has('gore')) {
    score += 0.35;
  }
  if (genres.has('psychological') || genres.has('gothic') || genres.has('slowburn')) {
    score -= 0.2;
  }
  return clamp01(score);
}

function moviePacingScore(movie: CandidateMovie): number {
  const genres = new Set(movie.genres.map((g) => g.toLowerCase()));
  let score = 0.5;
  if (genres.has('slasher') || genres.has('body-horror') || genres.has('monster')) {
    score += 0.25;
  }
  if (genres.has('psychological') || genres.has('gothic') || genres.has('slowburn')) {
    score -= 0.25;
  }
  return clamp01(score);
}

function moviePsychologicalScore(movie: CandidateMovie): number {
  const genres = new Set(movie.genres.map((g) => g.toLowerCase()));
  if (genres.has('psychological')) {
    return 1;
  }
  if (genres.has('supernatural') || genres.has('occult') || genres.has('paranormal')) {
    return 0;
  }
  return 0.5;
}

function movieGoreScore(movie: CandidateMovie): number {
  const genres = new Set(movie.genres.map((g) => g.toLowerCase()));
  if (genres.has('body-horror') || genres.has('gore') || genres.has('slasher')) {
    return 0.9;
  }
  if (genres.has('psychological') || genres.has('gothic')) {
    return 0.25;
  }
  return 0.5;
}

function movieAmbiguityScore(movie: CandidateMovie): number {
  const genres = new Set(movie.genres.map((g) => g.toLowerCase()));
  if (genres.has('psychological') || genres.has('surreal') || genres.has('mystery')) {
    return 0.85;
  }
  if (genres.has('slasher')) {
    return 0.25;
  }
  return 0.5;
}

function movieNostalgiaScore(movie: CandidateMovie): number {
  if (!movie.year) {
    return 0.5;
  }
  if (movie.year <= 1989) {
    return 1;
  }
  if (movie.year <= 1999) {
    return 0.8;
  }
  if (movie.year <= 2009) {
    return 0.6;
  }
  if (movie.year <= 2019) {
    return 0.35;
  }
  return 0.2;
}

function movieAuteurScore(movie: CandidateMovie): number {
  const genres = new Set(movie.genres.map((g) => g.toLowerCase()));
  if (genres.has('psychological') || genres.has('gothic') || genres.has('surreal')) {
    return 0.8;
  }
  if (genres.has('slasher')) {
    return 0.35;
  }
  return 0.5;
}

function genreAlignmentScore(movie: CandidateMovie, genreAffinity: Map<string, number>): number {
  if (movie.genres.length === 0) {
    return 0.5;
  }
  const affinityValues = movie.genres.map((genre) => genreAffinity.get(genre) ?? 0);
  const maxAbs = Math.max(1, ...affinityValues.map((v) => Math.abs(v)));
  const mean = affinityValues.reduce((sum, value) => sum + value, 0) / movie.genres.length;
  return clamp01((mean / maxAbs + 1) / 2);
}

function noveltyFactor(movie: CandidateMovie, recentGenreSets: Array<Set<string>>): number {
  if (recentGenreSets.length === 0) {
    return 0.7;
  }
  const movieGenres = new Set(movie.genres.map((g) => g.toLowerCase()));
  if (movieGenres.size === 0) {
    return 0.5;
  }
  const similarities = recentGenreSets.map((recent) => {
    const intersection = [...movieGenres].filter((g) => recent.has(g)).length;
    const union = new Set([...movieGenres, ...recent]).size;
    return union === 0 ? 0 : intersection / union;
  });
  const avgSimilarity = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
  return clamp01(1 - avgSimilarity);
}

function explorationFactor(movie: CandidateMovie): number {
  const seeded = Math.abs((movie.tmdbId * 2654435761) % 1000) / 1000;
  return clamp01(seeded);
}

export function scoreCandidate(
  movie: CandidateMovie,
  userTasteProfile: UserTasteProfileLike | null,
  input: {
    baseScore: number;
    genreAffinity: Map<string, number>;
    recentGenreSets: Array<Set<string>>;
    recommendationStyle: RecommendationStyle;
  },
): {
  finalScore: number;
  dnaScore: number;
  explorationBonus: number;
  novelty: number;
} {
  const novelty = noveltyFactor(movie, input.recentGenreSets);
  const exploration = explorationFactor(movie);

  if (!userTasteProfile) {
    const explorationBonus = exploration * (input.recommendationStyle === 'diversity' ? 0.06 : 0.03);
    return {
      finalScore: input.baseScore + explorationBonus,
      dnaScore: 0,
      explorationBonus,
      novelty,
    };
  }

  const intensityMatch = traitMatch(userTasteProfile.intensityPreference, movieIntensityScore(movie));
  const pacingMatch = traitMatch(userTasteProfile.pacingPreference, moviePacingScore(movie));
  const psychMatch = traitMatch(userTasteProfile.psychologicalVsSupernatural, moviePsychologicalScore(movie));
  const goreMatch = traitMatch(userTasteProfile.goreTolerance, movieGoreScore(movie));
  const ambiguityMatch = traitMatch(userTasteProfile.ambiguityTolerance, movieAmbiguityScore(movie));
  const nostalgiaMatch = traitMatch(userTasteProfile.nostalgiaBias, movieNostalgiaScore(movie));
  const auteurMatch = traitMatch(userTasteProfile.auteurAffinity, movieAuteurScore(movie));
  const genreAlign = genreAlignmentScore(movie, input.genreAffinity);

  const dnaScore = (
    intensityMatch * 0.24
    + pacingMatch * 0.17
    + genreAlign * 0.16
    + psychMatch * 0.12
    + goreMatch * 0.1
    + ambiguityMatch * 0.08
    + nostalgiaMatch * 0.07
    + auteurMatch * 0.06
    + novelty * 0.1
  ) * (input.recommendationStyle === 'diversity' ? 1.05 : 0.92);

  const explorationBonus = exploration * (input.recommendationStyle === 'diversity' ? 0.08 : 0.04);
  const finalScore = input.baseScore + dnaScore + explorationBonus;
  return {
    finalScore,
    dnaScore,
    explorationBonus,
    novelty,
  };
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
    const llmStartedAt = nowMs();
    console.info('[recommendations.llm] compose started', {
      tmdbId: input.movie.tmdbId,
      provider: input.llmProvider.name(),
    });
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

    console.info('[recommendations.llm] compose completed', {
      tmdbId: input.movie.tmdbId,
      durationMs: elapsedMs(llmStartedAt),
      provider: input.llmProvider.name(),
    });
    return parsed.data;
  } catch (error) {
    console.warn('[recommendations.llm] compose fallback', {
      tmdbId: input.movie.tmdbId,
      provider: input.llmProvider.name(),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown',
    });
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
    const recentRecommendationItems = await this.prisma.recommendationItem.findMany({
      where: { batch: { userId } },
      orderBy: [{ batch: { createdAt: 'desc' } }, { rank: 'asc' }],
      select: { movieId: true },
      take: 30,
    });
    const recentUnique = [...new Set(recentRecommendationItems.map((item) => item.movieId))].slice(0, 10);
    recentUnique.forEach((movieId) => excludedMovieIds.add(movieId));
    const latestBatch = await this.prisma.recommendationBatch.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        items: { select: { movieId: true } },
      },
    });
    latestBatch?.items.forEach((item) => excludedMovieIds.add(item.movieId));
    const allMovies = await this.prisma.movie.findMany({
      orderBy: { tmdbId: 'asc' },
      select: { id: true, tmdbId: true, posterUrl: true, genres: true, posterLastValidatedAt: true, ratings: { select: { source: true } } },
    });
    const eligible = allMovies
      .filter((movie) => !excludedMovieIds.has(movie.id))
      .filter((movie) => normalizeGenres(movie.genres).map((genre) => genre.toLowerCase()).includes(constraints.packPrimaryGenre.toLowerCase()))
      .filter((movie) => isRecommendationEligibleMovie({
        posterUrl: movie.posterUrl,
        posterLastValidatedAt: movie.posterLastValidatedAt,
        ratings: movie.ratings,
      }));
    let curatedIds: string[] = [];
    if (constraints.packId && constraints.journeyNodeSlug) {
      const curatedAssignments = await this.prisma.nodeMovie.findMany({
        where: {
          node: {
            packId: constraints.packId,
            slug: constraints.journeyNodeSlug,
          },
        },
        orderBy: { rank: 'asc' },
        select: { movieId: true },
      });
      const curatedSet = new Set(curatedAssignments.map((item) => item.movieId));
      const eligibleSet = new Set(eligible.map((movie) => movie.id));
      curatedIds = curatedAssignments
        .map((item) => item.movieId)
        .filter((movieId) => eligibleSet.has(movieId));
      const fallbackIds = eligible
        .filter((movie) => !curatedSet.has(movie.id))
        .map((movie) => movie.id);
      console.info('[recommendations.engine] curriculum candidates', {
        journeyNodeSlug: constraints.journeyNodeSlug,
        curatedCount: curatedIds.length,
        fallbackCount: fallbackIds.length,
      });
      if (curatedIds.length >= constraints.targetCount) {
        return curatedIds;
      }
      return [...curatedIds, ...fallbackIds];
    }
    console.info('[recommendations.engine] candidate poster quality', {
      totalMovies: allMovies.length,
      eligibleMovies: eligible.length,
      validated: allMovies.filter((movie) => Boolean(movie.posterLastValidatedAt)).length,
      fallbackApi: allMovies.filter((movie) => movie.posterUrl.startsWith('/api/posters/')).length,
      tmdbHost: allMovies.filter((movie) => movie.posterUrl.startsWith('https://image.tmdb.org/')).length,
      eligibleTmdbHost: eligible.filter((movie) => movie.posterUrl.startsWith('https://image.tmdb.org/')).length,
      eligibleFallbackApi: eligible.filter((movie) => movie.posterUrl.startsWith('/api/posters/')).length,
      sampleEligible: eligible.slice(0, 5).map((movie) => ({ tmdbId: movie.tmdbId, posterUrl: movie.posterUrl })),
    });
    return eligible.map((movie) => movie.id);
  }
}

export class HeuristicRerankerV1 implements Reranker {
  private lastDiagnostics: RerankDiagnostics | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  getLastRerankDiagnostics(): RerankDiagnostics | null {
    return this.lastDiagnostics;
  }

  async rerank(_userId: string, candidateIds: CandidateMovieId[], context: RecommendationContext): Promise<RankedMovieId[]> {
    const [profile, tasteProfile, history] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { userId: _userId },
        select: { tolerance: true, pacePreference: true, horrorDNA: true },
      }),
      this.prisma.userTasteProfile.findUnique({
        where: { userId: _userId },
        select: {
          intensityPreference: true,
          pacingPreference: true,
          psychologicalVsSupernatural: true,
          goreTolerance: true,
          ambiguityTolerance: true,
          nostalgiaBias: true,
          auteurAffinity: true,
        },
      }),
      this.prisma.userMovieInteraction.findMany({
        where: { userId: _userId },
        orderBy: { createdAt: 'desc' },
        take: 120,
        select: {
          status: true,
          rating: true,
          recommend: true,
          emotions: true,
          movie: { select: { genres: true, year: true } },
        },
      }),
    ]);

    const genreAffinity = new Map<string, number>();
    const decadeAffinity = new Map<number, number>();
    const recommendationStyle = resolveRecommendationStyle(profile?.horrorDNA);
    const historySize = history.length;
    history.forEach((interaction, index) => {
      const recencyWeight = historySize > 0 ? 0.6 + ((historySize - index) / historySize) * 0.4 : 1;
      const signal = normalizeInteractionSignal({
        status: interaction.status,
        rating: interaction.rating,
        recommend: interaction.recommend,
        emotions: Array.isArray(interaction.emotions)
          ? interaction.emotions.filter((value): value is string => typeof value === 'string')
          : [],
        recencyWeight,
      });

      normalizeGenres(interaction.movie.genres).forEach((genre) => {
        genreAffinity.set(genre, (genreAffinity.get(genre) ?? 0) + signal);
      });
      const decade = movieDecade(interaction.movie.year);
      if (decade !== null) {
        decadeAffinity.set(decade, (decadeAffinity.get(decade) ?? 0) + signal * 0.6);
      }
    });

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
    const recentGenreSets = history
      .filter((interaction) => interaction.status === InteractionStatus.WATCHED || interaction.status === InteractionStatus.ALREADY_SEEN)
      .slice(0, 3)
      .map((interaction) => new Set(normalizeGenres(interaction.movie.genres).map((g) => g.toLowerCase())));

    const scored = mapped.map((movie) => {
      const genres = movie.genres;
      const genreScore = genres.length > 0
        ? genres.reduce((sum, genre) => sum + (genreAffinity.get(genre) ?? 0), 0) / genres.length
        : 0;
      const decadeScore = (() => {
        const decade = movieDecade(movie.year);
        return decade !== null ? (decadeAffinity.get(decade) ?? 0) : 0;
      })();
      const popularityComponents = computePopularityComponents(movie.ratings);
      const popularityScore = computeBlendedPopularityScore(movie.ratings);
      const paceBias = profile?.pacePreference === 'slowburn'
        ? (genres.includes('psychological') || genres.includes('gothic') ? 0.15 : 0)
        : profile?.pacePreference === 'shock'
          ? (genres.includes('slasher') || genres.includes('body-horror') ? 0.15 : 0)
          : 0;
      const tolerancePenalty = typeof profile?.tolerance === 'number' && profile.tolerance <= 2
        ? (genres.includes('body-horror') ? -0.2 : 0)
        : 0;

      const popularityWeight = recommendationStyle === 'popularity' ? 1 : 0.2;
      const affinityWeight = recommendationStyle === 'popularity' ? 0.7 : 1;
      const baseScore = (genreScore + decadeScore) * affinityWeight + popularityScore * popularityWeight + paceBias + tolerancePenalty;
      const dna = scoreCandidate(movie, tasteProfile, {
        baseScore,
        genreAffinity,
        recentGenreSets,
        recommendationStyle,
      });
      return {
        movie,
        modelScore: dna.finalScore,
        baseScore,
        popularityComponents,
        dnaScore: dna.dnaScore,
        novelty: dna.novelty,
        exploration: dna.explorationBonus,
      };
    });

    const rankedByModel = scored
      .sort((a, b) => (b.modelScore - a.modelScore) || (a.movie.tmdbId - b.movie.tmdbId))
      .map((entry) => entry);

    const selected = rankedByModel.slice(0, context.targetCount).map((entry) => entry.movie);
    const selectedIds = new Set(selected.map((movie) => movie.id));
    const selectedGenres = new Set(selected.flatMap((movie) => movie.genres));
    const selectedDecades = new Set(selected.map((movie) => movieDecade(movie.year)).filter((decade): decade is number => decade !== null));
    const tailPool = rankedByModel
      .slice(context.targetCount, Math.max(context.targetCount * 8, context.targetCount))
      .filter((entry) => !selectedIds.has(entry.movie.id));

    // Post-step diversity constraint: only swap when we can increase diversity without sacrificing too much model score.
    if (recommendationStyle === 'diversity' && selected.length > 0 && tailPool.length > 0) {
      const lastSelectedScore = rankedByModel.find((entry) => entry.movie.id === selected[selected.length - 1]!.id)?.modelScore ?? 0;
      const swapCandidate = tailPool.find((entry) => {
        const decade = movieDecade(entry.movie.year);
        const addsGenre = entry.movie.genres.some((genre) => !selectedGenres.has(genre));
        const addsDecade = decade !== null && !selectedDecades.has(decade);
        const scoreGap = lastSelectedScore - entry.modelScore;
        return (addsGenre || addsDecade) && scoreGap <= 0.35;
      });

      if (swapCandidate) {
        selected[selected.length - 1] = swapCandidate.movie;
      }
    }

    const reranked = selected;
    const topModelSample = rankedByModel.slice(0, 5).map((entry) => ({
      tmdbId: entry.movie.tmdbId,
      genres: entry.movie.genres,
      modelScore: Number(entry.modelScore.toFixed(4)),
      components: {
        trend: Number(entry.popularityComponents.trend.toFixed(4)),
        quality: Number(entry.popularityComponents.quality.toFixed(4)),
        confidence: Number(entry.popularityComponents.confidence.toFixed(4)),
        dnaScore: Number(entry.dnaScore.toFixed(4)),
        novelty: Number(entry.novelty.toFixed(4)),
        exploration: Number(entry.exploration.toFixed(4)),
      },
    }));
    this.lastDiagnostics = {
      candidateCount: mapped.length,
      selectedCount: reranked.length,
      recommendationStyle,
      topModelSample,
    };
    console.info('[recommendations.engine] reranker model scoring', {
      candidateCount: mapped.length,
      poolCount: rankedByModel.length,
      selectedCount: reranked.length,
      recommendationStyle,
      topModelSample,
    });
    return reranked.map((movie) => movie.id);
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
  const startedAt = nowMs();
  console.info('[recommendations.engine] modern started');
  const userProfile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      tolerance: true,
      pacePreference: true,
      horrorDNA: true,
    },
  });
  console.info('[recommendations.engine] modern user profile', {
    hasProfile: Boolean(userProfile),
    pacePreference: userProfile?.pacePreference ?? null,
    tolerance: userProfile?.tolerance ?? null,
    recommendationStyle: resolveRecommendationStyle(userProfile?.horrorDNA),
  });
  const targetCount = options.targetCount ?? DEFAULT_TARGET_COUNT;
  const excludeRecentSkippedDays = options.excludeRecentSkippedDays ?? DEFAULT_SKIP_DAYS;
  const packPrimaryGenre = options.packPrimaryGenre ?? 'horror';
  const resolvedJourneyNode = options.journeyNode ?? (
    options.packId
      ? (await prisma.journeyProgress.findFirst({
        where: { userId, ...(options.packId ? { packId: options.packId } : {}) },
        orderBy: { lastUpdatedAt: 'desc' },
        select: { journeyNode: true },
      }))?.journeyNode ?? (
        await prisma.journeyNode.findFirst({
          where: { ...(options.packId ? { packId: options.packId } : {}) },
          orderBy: { orderIndex: 'asc' },
          select: { slug: true },
        })
      )?.slug ?? 'ENGINE_V1_CORE'
      : 'ENGINE_V1_CORE'
  );

  const countersStartedAt = nowMs();
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
  console.info('[recommendations.engine] modern counters loaded', {
    durationMs: elapsedMs(countersStartedAt),
    excludedSeenCount,
    excludedSkippedRecentCount,
    allMovieCount,
  });

  const candidateStartedAt = nowMs();
  const candidateIds = await deps.candidateGenerator.generateCandidates(userId, {
    targetCount,
    excludeRecentSkippedDays,
    packPrimaryGenre,
    packId: options.packId,
    journeyNodeSlug: resolvedJourneyNode,
  });
  console.info('[recommendations.engine] modern candidates generated', {
    durationMs: elapsedMs(candidateStartedAt),
    candidateCount: candidateIds.length,
  });

  const rerankStartedAt = nowMs();
  const rankedIds = await deps.reranker.rerank(userId, candidateIds, { targetCount });
  console.info('[recommendations.engine] modern rerank completed', {
    durationMs: elapsedMs(rerankStartedAt),
    rankedCount: rankedIds.length,
  });

  const exploreStartedAt = nowMs();
  const exploration = await deps.explorationPolicy.chooseExploration(rankedIds, userProfile, {});
  console.info('[recommendations.engine] modern exploration completed', {
    durationMs: elapsedMs(exploreStartedAt),
    explorationUsed: exploration.explorationUsed,
  });

  const selectedIds = exploration.finalRankedIds.slice(0, targetCount);
  const moviesStartedAt = nowMs();
  const movies = await prisma.movie.findMany({
    where: { id: { in: selectedIds } },
    select: { id: true, tmdbId: true, title: true, year: true, posterUrl: true, genres: true, ratings: { select: { source: true, value: true, scale: true, rawValue: true } } },
  });
  console.info('[recommendations.engine] modern movies loaded', {
    durationMs: elapsedMs(moviesStartedAt),
    selectedCount: selectedIds.length,
    loadedCount: movies.length,
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
  console.info('[recommendations.engine] selected poster quality', {
    selectedCount: orderedMovies.length,
    tmdbHost: orderedMovies.filter((movie) => movie.posterUrl.startsWith('https://image.tmdb.org/')).length,
    fallbackApi: orderedMovies.filter((movie) => movie.posterUrl.startsWith('/api/posters/')).length,
    sample: orderedMovies.map((movie) => ({ tmdbId: movie.tmdbId, posterUrl: movie.posterUrl })),
  });
  const streamingLookup = new StreamingLookupService(prisma, new DeterministicStubStreamingProvider());
  const streamingStartedAt = nowMs();
  const streamingByMovieId = new Map(
    await Promise.all(
      orderedMovies.map(async (movie) => {
        const streaming = await streamingLookup.getForMovie(movie);
        return [movie.id, streaming.offers] as const;
      }),
    ),
  );
  console.info('[recommendations.engine] modern streaming resolved', {
    durationMs: elapsedMs(streamingStartedAt),
    movieCount: orderedMovies.length,
  });

  const narrativeStartedAt = nowMs();
  const itemData = await Promise.all(
    orderedMovies.map(async (movie, index) => {
      const rank = index + 1;
      const evidence = await deps.evidenceRetriever.getEvidenceForMovie(movie.id, 'US');
      const journeyNode = `${resolvedJourneyNode}#RANK_${rank}`;
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
        profileSummary: summarizeProfileSignals(userProfile),
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
        journeyNode: resolvedJourneyNode,
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

      const narrative = await deps.narrativeComposer.compose(movie, userProfile, journeyNode, evidence);
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
  console.info('[recommendations.engine] modern narratives resolved', {
    durationMs: elapsedMs(narrativeStartedAt),
    itemCount: itemData.length,
  });

  const persistStartedAt = nowMs();
  const batch = await prisma.recommendationBatch.create({
    data: {
      userId,
      ...(options.packId ? { packId: options.packId } : {}),
      journeyNode: resolvedJourneyNode,
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
  console.info('[recommendations.engine] modern batch persisted', {
    durationMs: elapsedMs(persistStartedAt),
    batchId: batch.id,
    itemCount: batch.items.length,
  });

  const diagnosticsStartedAt = nowMs();
  const rerankDiagnostics = typeof deps.reranker.getLastRerankDiagnostics === 'function'
    ? deps.reranker.getLastRerankDiagnostics()
    : null;
  const avgDnaScore = rerankDiagnostics && rerankDiagnostics.topModelSample.length > 0
    ? Number((
      rerankDiagnostics.topModelSample.reduce((sum, entry) => sum + entry.components.dnaScore, 0)
      / rerankDiagnostics.topModelSample.length
    ).toFixed(4))
    : null;
  const recentInteractions = await prisma.userMovieInteraction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { status: true },
  });
  const recentCount = recentInteractions.length;
  const watchedOrSeenCount = recentInteractions.filter((item) =>
    item.status === InteractionStatus.WATCHED || item.status === InteractionStatus.ALREADY_SEEN).length;
  const skippedCount = recentInteractions.filter((item) => item.status === InteractionStatus.SKIPPED).length;
  const olderSlice = recentInteractions.slice(20);
  const newerSlice = recentInteractions.slice(0, 20);
  const olderPositiveRate = olderSlice.length > 0
    ? olderSlice.filter((item) => item.status === InteractionStatus.WATCHED || item.status === InteractionStatus.ALREADY_SEEN).length / olderSlice.length
    : null;
  const newerPositiveRate = newerSlice.length > 0
    ? newerSlice.filter((item) => item.status === InteractionStatus.WATCHED || item.status === InteractionStatus.ALREADY_SEEN).length / newerSlice.length
    : null;
  const engagementTrend = (olderPositiveRate !== null && newerPositiveRate !== null)
    ? Number((newerPositiveRate - olderPositiveRate).toFixed(4))
    : null;

  await prisma.recommendationDiagnostics.create({
    data: {
      batchId: batch.id,
      candidateCount: candidateIds.length,
      excludedSeenCount,
      excludedSkippedRecentCount,
      diversityStats: {
        candidatePool: allMovieCount,
        selectedCount: orderedMovies.length,
        engagement: {
          recentInteractionCount: recentCount,
          watchedOrSeenCount,
          skippedCount,
          watchedOrSeenRate: recentCount > 0 ? Number((watchedOrSeenCount / recentCount).toFixed(4)) : null,
          skippedRate: recentCount > 0 ? Number((skippedCount / recentCount).toFixed(4)) : null,
          positiveRateTrendLast20VsPrev20: engagementTrend,
        },
        reranker: rerankDiagnostics,
        dna: {
          avgTopModelDnaScore: avgDnaScore,
        },
      },
      explorationUsed: exploration.explorationUsed,
      notes: 'modern mode diagnostics',
    },
  });
  console.info('[recommendations.engine] modern diagnostics persisted', {
    durationMs: elapsedMs(diagnosticsStartedAt),
  });
  console.info('[recommendations.engine] modern completed', {
    durationMs: elapsedMs(startedAt),
    batchId: batch.id,
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
        reception: (() => {
          const raw = item.reception;
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {};
          }
          const record = raw as Record<string, unknown>;
          return {
            ...(typeof record.critics === 'number' ? { critics: record.critics } : {}),
            ...(typeof record.audience === 'number' ? { audience: record.audience } : {}),
            ...(typeof record.summary === 'string' ? { summary: record.summary } : {}),
          };
        })(),
        castHighlights: normalizeCastHighlights(item.castHighlights),
        streaming: streamingByMovieId.get(item.movie.id) ?? [],
        spoilerPolicy: item.spoilerPolicy as 'NO_SPOILERS' | 'LIGHT' | 'FULL',
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
  const startedAt = nowMs();
  const tmdbSyncStartedAt = nowMs();
  await syncTmdbHorrorCandidates(prisma);
  console.info('[recommendations.engine] tmdb sync completed', {
    durationMs: elapsedMs(tmdbSyncStartedAt),
  });

  let llmProvider: LlmProvider | undefined;
  const llmProviderStartedAt = nowMs();
  if (process.env.LLM_PROVIDER) {
    try {
      llmProvider = getLlmProviderFromEnv();
    } catch {
      llmProvider = undefined;
    }
  }
  console.info('[recommendations.engine] llm provider resolved', {
    durationMs: elapsedMs(llmProviderStartedAt),
    provider: llmProvider?.name() ?? 'disabled',
  });

  const mode = process.env.REC_ENGINE_MODE === 'modern' ? 'modern' : 'v1';
  const effectivePack = await resolveEffectivePackForUser(prisma, userId);
  const effectiveOptions: RecommendationEngineOptions = {
    ...options,
    packId: effectivePack.packId,
    packPrimaryGenre: effectivePack.primaryGenre,
  };
  console.info('[recommendations.engine] mode selected', { mode });
  if (mode === 'v1') {
    const result = await generateRecommendationBatchV1(userId, prisma, effectiveOptions);
    console.info('[recommendations.engine] v1 completed', {
      durationMs: elapsedMs(startedAt),
      batchId: result.batchId,
    });
    return result;
  }

  const result = await generateRecommendationBatchModern(
    userId,
    prisma,
    {
      candidateGenerator: new SqlCandidateGeneratorV1(prisma),
      reranker: new HeuristicRerankerV1(prisma),
      explorationPolicy: new NoExplorationPolicyV1(),
      evidenceRetriever: new CachedEvidenceRetrieverV1(prisma),
      narrativeComposer: new TemplateNarrativeComposerV1(llmProvider),
    },
    effectiveOptions,
  );
  console.info('[recommendations.engine] modern wrapper completed', {
    durationMs: elapsedMs(startedAt),
    batchId: result.batchId,
  });
  return result;
}
