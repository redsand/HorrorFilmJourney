import { z } from 'zod';

export const spoilerPolicySchema = z.enum(['NO_SPOILERS', 'LIGHT', 'FULL']);

export const streamingOptionSchema = z.object({
  provider: z.string(),
  type: z.enum(['subscription', 'rent', 'buy', 'free']),
  url: z.string().optional(),
  price: z.string().optional(),
});

export const recommendationCardNarrativeSchema = z.object({
  whyImportant: z.string(),
  whatItTeaches: z.string(),
  watchFor: z.array(z.string()).length(3),
  historicalContext: z.string(),
  reception: z.object({
    critics: z.number().optional(),
    audience: z.number().optional(),
    summary: z.string().optional(),
  }),
  castHighlights: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().optional(),
      }),
    )
    .max(6),
  streaming: z.array(streamingOptionSchema),
  spoilerPolicy: spoilerPolicySchema,
  journeyNode: z.string(),
  nextStepHint: z.string(),
});

export const interactionStatusSchema = z.enum([
  'WATCHED',
  'ALREADY_SEEN',
  'SKIPPED',
  'WANT_TO_WATCH',
]);

const quickPollBaseSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  intensity: z.number().int().min(1).max(5).optional(),
  emotions: z
    .array(z.string())
    .optional()
    .transform((value) => value?.slice(0, 5)),
  workedBest: z
    .array(z.string())
    .optional()
    .transform((value) => value?.slice(0, 3)),
  agedWell: z.string().optional(),
  recommend: z.boolean().optional(),
});

export function quickPollSchemaForStatus(status: z.infer<typeof interactionStatusSchema>) {
  if (status === 'WATCHED' || status === 'ALREADY_SEEN') {
    return quickPollBaseSchema.extend({
      rating: z.number().int().min(1).max(5),
    });
  }

  return quickPollBaseSchema;
}

export type RecommendationCardNarrative = z.infer<typeof recommendationCardNarrativeSchema>;
export type QuickPoll = z.infer<typeof quickPollBaseSchema>;
