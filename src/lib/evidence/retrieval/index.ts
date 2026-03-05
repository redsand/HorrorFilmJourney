import type { PrismaClient } from '@prisma/client';
import type {
  EvidencePacketVM,
  EvidenceRetriever,
  EvidenceRetrievalQuery,
} from '@/lib/evidence/evidence-retriever';
import { normalizeEvidenceRetrievalQuery } from '@/lib/evidence/evidence-retriever';
import { packageEvidencePackets } from '@/lib/evidence/evidence-packager';
import type { EvidenceRetrieverV2 } from './types';
import { lexicalScoreEvidence } from './lexical-retriever';
import { semanticScoreEvidence } from './semantic-retriever';
import { reciprocalRankFusion } from './fusion-reranker';
import { applyGovernanceWithStats } from './governance';

type PrismaEvidenceClient = Pick<PrismaClient, 'evidencePacket' | 'externalReadingCuration'> & {
  evidenceChunk?: {
    findMany: (args: {
      where: { document: { movieId: string } };
      orderBy: Array<{ updatedAt: 'desc' }>;
      take: number;
      select: {
        text: true;
        updatedAt: true;
        createdAt: true;
        document: {
          select: {
            sourceName: true;
            url: true;
          };
        };
      };
    }) => Promise<Array<{
      text: string;
      updatedAt?: Date;
      createdAt: Date;
      document: { sourceName: string; url: string };
    }>>;
  };
} & {
  retrievalRun?: {
    create: (args: {
      data: {
        movieId: string;
        mode: string;
        fallbackUsed: boolean;
        fallbackReason?: string | null;
        seasonSlug?: string | null;
        packId?: string | null;
        queryText?: string | null;
        candidateCount: number;
        selectedCount: number;
        duplicateRate?: number;
        citationValidRate?: number;
        latencyMs: number;
      };
    }) => Promise<unknown>;
  };
};

type EvidenceRetrievalMode = 'cache' | 'hybrid';

function resolveRetrievalMode(): EvidenceRetrievalMode {
  return process.env.EVIDENCE_RETRIEVAL_MODE === 'hybrid' ? 'hybrid' : 'cache';
}

function retrievalRequireIndex(): boolean {
  return process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX === 'true';
}

function resolveTopK(input: EvidenceRetrievalQuery): number {
  const value = input.topK;
  if (!Number.isInteger(value) || !value) {
    return 5;
  }
  return Math.max(1, Math.min(12, value));
}

function defaultQueryText(query: EvidenceRetrievalQuery): string {
  return query.query?.trim() || 'film context production reception influence';
}

function toIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

class CachedEvidenceRetriever implements EvidenceRetriever {
  constructor(private readonly prisma: PrismaEvidenceClient) {}

  async getEvidenceForMovie(movieId: string, rawQuery?: string | EvidenceRetrievalQuery): Promise<EvidencePacketVM[]> {
    const query = normalizeEvidenceRetrievalQuery(rawQuery);
    const evidence = await this.prisma.evidencePacket.findMany({
      where: { movieId },
      orderBy: { retrievedAt: 'desc' },
      take: resolveTopK(query),
      select: {
        sourceName: true,
        url: true,
        snippet: true,
        retrievedAt: true,
      },
    });
    return packageEvidencePackets(
      evidence.map((item) => ({
        sourceName: item.sourceName,
        ...(item.url ? { url: item.url } : {}),
        snippet: item.snippet,
        retrievedAt: toIsoString(item.retrievedAt),
      })),
      resolveTopK(query),
    );
  }
}

class HybridEvidenceRetriever implements EvidenceRetrieverV2 {
  constructor(private readonly prisma: PrismaEvidenceClient) {}

  async retrieve(input: { movieId: string; query: EvidenceRetrievalQuery }): Promise<{
    evidence: EvidencePacketVM[];
    candidateCount: number;
    duplicateDrops: number;
  }> {
    const topK = resolveTopK(input.query);
    const queryText = defaultQueryText(input.query);
    const includeExternalReadings = input.query.includeExternalReadings ?? true;

    const packetRows = await this.prisma.evidencePacket.findMany({
      where: { movieId: input.movieId },
      orderBy: { retrievedAt: 'desc' },
      take: 100,
      select: {
        sourceName: true,
        url: true,
        snippet: true,
        retrievedAt: true,
      },
    });
    const packetEvidence: EvidencePacketVM[] = packetRows.map((item) => ({
      sourceName: item.sourceName,
      ...(item.url ? { url: item.url } : {}),
      snippet: item.snippet,
      retrievedAt: toIsoString(item.retrievedAt),
    }));

    const externalEvidence: EvidencePacketVM[] = includeExternalReadings && input.query.seasonSlug
      ? (await this.prisma.externalReadingCuration.findMany({
        where: {
          movieId: input.movieId,
          season: { slug: input.query.seasonSlug },
        },
        orderBy: [{ publicationDate: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        select: {
          sourceName: true,
          url: true,
          articleTitle: true,
          publicationDate: true,
          createdAt: true,
        },
      })).map((item) => ({
        sourceName: item.sourceName,
        url: item.url,
        snippet: item.articleTitle,
        retrievedAt: toIsoString(item.publicationDate ?? item.createdAt),
      }))
      : [];

    const chunkEvidenceRows = this.prisma.evidenceChunk
      ? await this.prisma.evidenceChunk.findMany({
        where: {
          document: {
            movieId: input.movieId,
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 100,
        select: {
          text: true,
          updatedAt: true,
          createdAt: true,
          document: {
            select: {
              sourceName: true,
              url: true,
            },
          },
        },
      })
      : [];
    const chunkEvidence: EvidencePacketVM[] = chunkEvidenceRows.map((item) => ({
      sourceName: item.document.sourceName,
      ...(item.document.url ? { url: item.document.url } : {}),
      snippet: item.text,
      retrievedAt: toIsoString(item.updatedAt ?? item.createdAt),
    }));

    const corpus = [...packetEvidence, ...externalEvidence, ...chunkEvidence];
    if (corpus.length === 0) {
      return {
        evidence: [],
        candidateCount: 0,
        duplicateDrops: 0,
      };
    }

    const lexicalScores = lexicalScoreEvidence(corpus, queryText);
    const semanticScores = semanticScoreEvidence(corpus, queryText);
    const fused = reciprocalRankFusion(corpus, lexicalScores, semanticScores);
    const governed = applyGovernanceWithStats(fused, topK);
    const evidence = packageEvidencePackets(governed.selected.map((item) => ({
      sourceName: item.sourceName,
      ...(item.url ? { url: item.url } : {}),
      snippet: item.snippet,
      retrievedAt: item.retrievedAt,
    })), topK);

    return {
      evidence,
      candidateCount: corpus.length,
      duplicateDrops: governed.duplicateDrops,
    };
  }
}

class HybridWithFallbackEvidenceRetriever implements EvidenceRetriever {
  private readonly fallback: CachedEvidenceRetriever;
  private readonly hybrid: HybridEvidenceRetriever;

  constructor(private readonly prisma: PrismaEvidenceClient) {
    this.fallback = new CachedEvidenceRetriever(prisma);
    this.hybrid = new HybridEvidenceRetriever(prisma);
  }

  private async persistRun(input: {
    movieId: string;
    query: EvidenceRetrievalQuery;
    fallbackUsed: boolean;
    fallbackReason?: string;
    candidateCount: number;
    selectedCount: number;
    duplicateRate: number;
    citationValidRate: number;
    latencyMs: number;
  }): Promise<void> {
    if (!this.prisma.retrievalRun) {
      return;
    }
    await this.prisma.retrievalRun.create({
      data: {
        movieId: input.movieId,
        mode: 'hybrid',
        fallbackUsed: input.fallbackUsed,
        ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
        ...(input.query.seasonSlug ? { seasonSlug: input.query.seasonSlug } : {}),
        ...(input.query.packId ? { packId: input.query.packId } : {}),
        ...(input.query.query ? { queryText: input.query.query } : {}),
        candidateCount: input.candidateCount,
        selectedCount: input.selectedCount,
        duplicateRate: input.duplicateRate,
        citationValidRate: input.citationValidRate,
        latencyMs: input.latencyMs,
      },
    });
  }

  async getEvidenceForMovie(movieId: string, rawQuery?: string | EvidenceRetrievalQuery): Promise<EvidencePacketVM[]> {
    const query = normalizeEvidenceRetrievalQuery(rawQuery);
    const startedAt = Date.now();
    try {
      const hybridResult = await this.hybrid.retrieve({ movieId, query });
      const citationValidCount = hybridResult.evidence.filter((item) =>
        item.sourceName.trim().length > 0 && item.snippet.trim().length > 0).length;
      const citationValidRate = hybridResult.evidence.length > 0
        ? citationValidCount / hybridResult.evidence.length
        : 1;
      const duplicateRate = hybridResult.candidateCount > 0
        ? hybridResult.duplicateDrops / hybridResult.candidateCount
        : 0;
      await this.persistRun({
        movieId,
        query,
        fallbackUsed: false,
        candidateCount: hybridResult.candidateCount,
        selectedCount: hybridResult.evidence.length,
        duplicateRate: Number(duplicateRate.toFixed(6)),
        citationValidRate: Number(citationValidRate.toFixed(6)),
        latencyMs: Date.now() - startedAt,
      });
      if (hybridResult.evidence.length > 0 || retrievalRequireIndex()) {
        return hybridResult.evidence;
      }
      const fallbackResult = await this.fallback.getEvidenceForMovie(movieId, query);
      await this.persistRun({
        movieId,
        query,
        fallbackUsed: true,
        fallbackReason: 'empty-hybrid',
        candidateCount: 0,
        selectedCount: fallbackResult.length,
        duplicateRate: 0,
        citationValidRate: 1,
        latencyMs: Date.now() - startedAt,
      });
      return fallbackResult;
    } catch (error) {
      if (retrievalRequireIndex()) {
        throw error;
      }
      const fallbackResult = await this.fallback.getEvidenceForMovie(movieId, query);
      await this.persistRun({
        movieId,
        query,
        fallbackUsed: true,
        fallbackReason: 'hybrid-error',
        candidateCount: 0,
        selectedCount: fallbackResult.length,
        duplicateRate: 0,
        citationValidRate: 1,
        latencyMs: Date.now() - startedAt,
      });
      return fallbackResult;
    }
  }
}

export function createConfiguredEvidenceRetriever(prisma: PrismaEvidenceClient): EvidenceRetriever {
  const mode = resolveRetrievalMode();
  if (mode === 'hybrid') {
    return new HybridWithFallbackEvidenceRetriever(prisma);
  }
  return new CachedEvidenceRetriever(prisma);
}

export { CachedEvidenceRetriever };
