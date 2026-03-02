import { z } from 'zod';

const zScoreScale = z.enum(['10', '100']);

const zRatingValue = z
  .object({
    value: z.number(),
    scale: zScoreScale,
    rawValue: z.string().optional(),
  })
  .strict();

const zAdditionalRating = z
  .object({
    source: z.string(),
    value: z.number(),
    scale: zScoreScale,
    rawValue: z.string().optional(),
  })
  .strict();

const zReceptionScore = z
  .object({
    source: z.string(),
    value: z.number(),
    scale: z.literal('100'),
    rawValue: z.string().optional(),
  })
  .strict();

const zCastHighlight = z
  .object({
    name: z.string(),
    role: z.string().optional(),
  })
  .strict();

const zStreamingOffer = z
  .object({
    provider: z.string(),
    type: z.enum(['subscription', 'rent', 'buy', 'free']),
    url: z.string().optional(),
    price: z.string().optional(),
  })
  .strict();

const zEvidenceItem = z
  .object({
    sourceName: z.string(),
    url: z.string().optional(),
    snippet: z.string(),
    retrievedAt: z.string(),
  })
  .strict();

export const zMovieCardVM = z
  .object({
    movie: z
      .object({
        tmdbId: z.number(),
        title: z.string(),
        year: z.number().optional(),
        posterUrl: z.string(),
      })
      .strict(),
    ratings: z
      .object({
        imdb: zRatingValue,
        additional: z.array(zAdditionalRating).min(1).max(3),
      })
      .strict(),
    reception: z
      .object({
        critics: zReceptionScore.optional(),
        audience: zReceptionScore.optional(),
        summary: z.string().optional(),
      })
      .strict(),
    credits: z
      .object({
        director: z.string().optional(),
        castHighlights: z.array(zCastHighlight).max(6),
      })
      .strict(),
    streaming: z
      .object({
        region: z.string(),
        offers: z.array(zStreamingOffer),
      })
      .strict(),
    codex: z
      .object({
        whyImportant: z.string(),
        whatItTeaches: z.string(),
        watchFor: z.tuple([z.string(), z.string(), z.string()]),
        historicalContext: z.string(),
        spoilerPolicy: z.enum(['NO_SPOILERS', 'LIGHT', 'FULL']),
        journeyNode: z.string(),
        nextStepHint: z.string(),
      })
      .strict(),
    evidence: z.array(zEvidenceItem),
  })
  .strict();

export const zMovieCardVMArray = z.array(zMovieCardVM);

export type MovieCardVM = z.infer<typeof zMovieCardVM>;
