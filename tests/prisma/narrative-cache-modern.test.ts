import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { LlmProvider } from '@/ai/llmProvider';
import {
  generateRecommendationBatchModern,
  NoExplorationPolicyV1,
  TemplateNarrativeComposerV1,
  type CandidateGenerator,
  type Reranker,
} from '@/lib/recommendation/recommendation-engine';
import {
  NARRATIVE_VERSION,
  computeEvidenceHashes,
  computeNarrativeHash,
} from '@/lib/recommendation/narrative-cache';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('narrative_cache_modern_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
const expectedGeminiModel = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.evidencePacket.deleteMany();
  await prisma.movieEmbedding.deleteMany();
  await prisma.userEmbeddingSnapshot.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();
});

async function seedBase(): Promise<{
  userId: string;
  movieId: string;
  movieFacts: {
    tmdbId: number;
    title: string;
    year: number | null;
    genres: string[];
    ratings: {
      imdb: { value: number; scale: string; rawValue?: string };
      additional: Array<{ source: string; value: number; scale: string; rawValue?: string }>;
    };
  };
}> {
  const user = await prisma.user.create({ data: { displayName: 'Cache User' } });
  const movie = await prisma.movie.create({
    data: {
      tmdbId: 501,
      title: 'Cache Movie',
      year: 2001,
      posterUrl: 'https://img/501.jpg',
      genres: ['horror'],
    },
  });

  await prisma.movieRating.createMany({
    data: [
      { movieId: movie.id, source: 'IMDB', value: 7.8, scale: '10', rawValue: '7.8/10' },
      { movieId: movie.id, source: 'ROTTEN_TOMATOES', value: 88, scale: '100', rawValue: '88%' },
      { movieId: movie.id, source: 'METACRITIC', value: 75, scale: '100', rawValue: '75/100' },
    ],
  });

  return {
    userId: user.id,
    movieId: movie.id,
    movieFacts: {
      tmdbId: 501,
      title: 'Cache Movie',
      year: 2001,
      genres: ['horror'],
      ratings: {
        imdb: { value: 7.8, scale: '10', rawValue: '7.8/10' },
        additional: [
          { source: 'ROTTEN_TOMATOES', value: 88, scale: '100', rawValue: '88%' },
          { source: 'METACRITIC', value: 75, scale: '100', rawValue: '75/100' },
        ],
      },
    },
  };
}

describe('narrative cache in modern generation', () => {
  it('same inputs reuses cached narrative and does not call provider', async () => {
    const seed = await seedBase();
    const evidence = [{ sourceName: 'SourceA', snippet: 'SnippetA', retrievedAt: '2026-01-01T00:00:00.000Z' }];
    const hash = computeNarrativeHash({
      movieFacts: seed.movieFacts,
      journeyNode: 'ENGINE_V1_CORE#RANK_1',
      evidenceHashes: computeEvidenceHashes(evidence),
      narrativeVersion: NARRATIVE_VERSION,
    });

    await prisma.recommendationBatch.create({
      data: {
        userId: seed.userId,
        journeyNode: 'ENGINE_V1_CORE',
        items: {
          create: {
            movieId: seed.movieId,
            rank: 1,
            whyImportant: 'cached why',
            whatItTeaches: 'cached teach',
            historicalContext: 'cached context',
            nextStepHint: 'cached next',
            watchFor: ['a', 'b', 'c'],
            reception: {},
            castHighlights: [],
            streaming: [],
            spoilerPolicy: 'NO_SPOILERS',
            narrativeVersion: NARRATIVE_VERSION,
            narrativeModel: expectedGeminiModel,
            narrativeHash: hash,
            narrativeGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
      },
    });

    const provider: LlmProvider = {
      name: () => 'gemini',
      generateJson: vi.fn().mockResolvedValue({}),
    };
    const composer = new TemplateNarrativeComposerV1(provider);
    const candidateGenerator: CandidateGenerator = { generateCandidates: async () => [seed.movieId] };
    const reranker: Reranker = { rerank: async () => [seed.movieId] };

    await generateRecommendationBatchModern(
      seed.userId,
      prisma,
      {
        candidateGenerator,
        reranker,
        explorationPolicy: new NoExplorationPolicyV1(),
        evidenceRetriever: { getEvidenceForMovie: async () => evidence },
        narrativeComposer: composer,
      },
      { targetCount: 1, seasonSlug: 'season-1', packSlug: 'horror' },
    );

    expect(provider.generateJson).not.toHaveBeenCalled();
  });

  it('different evidence causes provider call and cache hash update', async () => {
    const seed = await seedBase();
    const oldEvidence = [{ sourceName: 'SourceA', snippet: 'Old Snippet', retrievedAt: '2026-01-01T00:00:00.000Z' }];
    const oldHash = computeNarrativeHash({
      movieFacts: seed.movieFacts,
      journeyNode: 'ENGINE_V1_CORE#RANK_1',
      evidenceHashes: computeEvidenceHashes(oldEvidence),
      narrativeVersion: NARRATIVE_VERSION,
    });

    await prisma.recommendationBatch.create({
      data: {
        userId: seed.userId,
        journeyNode: 'ENGINE_V1_CORE',
        items: {
          create: {
            movieId: seed.movieId,
            rank: 1,
            whyImportant: 'cached why',
            whatItTeaches: 'cached teach',
            historicalContext: 'cached context',
            nextStepHint: 'cached next',
            watchFor: ['a', 'b', 'c'],
            reception: {},
            castHighlights: [],
            streaming: [],
            spoilerPolicy: 'NO_SPOILERS',
            narrativeVersion: NARRATIVE_VERSION,
            narrativeModel: expectedGeminiModel,
            narrativeHash: oldHash,
            narrativeGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
      },
    });

    const provider: LlmProvider = {
      name: () => 'gemini',
      generateJson: vi.fn().mockResolvedValue({
        whyImportant: 'llm why',
        whatItTeaches: 'llm teach',
        watchFor: ['x', 'y', 'z'],
        historicalContext: 'llm context',
        reception: {},
        castHighlights: [],
        streaming: [],
        spoilerPolicy: 'NO_SPOILERS',
        journeyNode: 'ENGINE_V1_CORE',
        nextStepHint: 'llm next',
        ratings: seed.movieFacts.ratings,
      }),
    };
    const composer = new TemplateNarrativeComposerV1(provider);
    const candidateGenerator: CandidateGenerator = { generateCandidates: async () => [seed.movieId] };
    const reranker: Reranker = { rerank: async () => [seed.movieId] };
    const newEvidence = [{ sourceName: 'SourceA', snippet: 'New Snippet', retrievedAt: '2026-01-01T00:00:00.000Z' }];

    const result = await generateRecommendationBatchModern(
      seed.userId,
      prisma,
      {
        candidateGenerator,
        reranker,
        explorationPolicy: new NoExplorationPolicyV1(),
        evidenceRetriever: { getEvidenceForMovie: async () => newEvidence },
        narrativeComposer: composer,
      },
      { targetCount: 1, seasonSlug: 'season-1', packSlug: 'horror' },
    );

    expect(provider.generateJson).toHaveBeenCalledTimes(1);
    expect(result.cards[0]).toBeDefined();

    const latestItem = await prisma.recommendationItem.findUnique({
      where: { id: result.cards[0]!.id },
      select: { narrativeHash: true, narrativeVersion: true, narrativeModel: true },
    });

    const expectedNewHash = computeNarrativeHash({
      movieFacts: seed.movieFacts,
      journeyNode: 'ENGINE_V1_CORE#RANK_1',
      evidenceHashes: computeEvidenceHashes(newEvidence),
      narrativeVersion: NARRATIVE_VERSION,
    });

    expect(latestItem?.narrativeHash).toBe(expectedNewHash);
    expect(latestItem?.narrativeVersion).toBe(NARRATIVE_VERSION);
    expect(latestItem?.narrativeModel).toBe(expectedGeminiModel);
  });
});
