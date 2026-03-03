import { createHash } from 'node:crypto';
import type { RecommendationCardNarrative } from '@/lib/contracts/narrative-contracts';
import { recommendationCardNarrativeSchema } from '@/lib/contracts/narrative-contracts';

export const NARRATIVE_VERSION = 'narrative-v2';

export type NarrativeHashInput = {
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
  journeyNode: string;
  evidenceHashes: string[];
  profileSummary?: string;
  narrativeVersion?: string;
};

type CachedNarrativeItem = {
  narrativeHash: string | null;
  narrativeVersion: string | null;
  whyImportant: string;
  whatItTeaches: string;
  historicalContext: string;
  nextStepHint: string;
  watchFor: unknown;
  reception: unknown;
  castHighlights: unknown;
  streaming: unknown;
  spoilerPolicy: string;
} | null;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function computeNarrativeHash(input: NarrativeHashInput): string {
  return sha256(
    JSON.stringify({
      narrativeVersion: input.narrativeVersion ?? NARRATIVE_VERSION,
      movieFacts: input.movieFacts,
      journeyNode: input.journeyNode,
      evidenceHashes: [...input.evidenceHashes].sort(),
      profileSummary: input.profileSummary ?? '',
    }),
  );
}

export function getCachedNarrativeIfFresh(
  item: CachedNarrativeItem,
  inputHash: string,
  context: {
    journeyNode: string;
    ratings: RecommendationCardNarrative['ratings'];
    narrativeVersion?: string;
  },
): RecommendationCardNarrative | null {
  if (!item) {
    return null;
  }

  if (item.narrativeHash !== inputHash || item.narrativeVersion !== (context.narrativeVersion ?? NARRATIVE_VERSION)) {
    return null;
  }

  const parsed = recommendationCardNarrativeSchema.safeParse({
    whyImportant: item.whyImportant,
    whatItTeaches: item.whatItTeaches,
    watchFor: Array.isArray(item.watchFor) ? item.watchFor : [],
    historicalContext: item.historicalContext,
    reception: item.reception ?? {},
    castHighlights: Array.isArray(item.castHighlights) ? item.castHighlights : [],
    streaming: Array.isArray(item.streaming) ? item.streaming : [],
    spoilerPolicy: item.spoilerPolicy,
    journeyNode: context.journeyNode,
    nextStepHint: item.nextStepHint,
    ratings: context.ratings,
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function computeEvidenceHashes(
  evidence: Array<{ sourceName: string; url?: string; snippet: string; retrievedAt: string }>,
): string[] {
  return evidence.map((item) =>
    sha256(`${item.sourceName.trim().toUpperCase()}::${item.url?.trim() ?? ''}::${item.snippet.trim()}::${item.retrievedAt}`),
  );
}
