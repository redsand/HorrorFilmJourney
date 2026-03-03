import { z } from 'zod';

export const externalReadingSourceTypeSchema = z.enum(['review', 'essay', 'retrospective']);

export const zExternalReading = z.object({
  sourceName: z.string().trim().min(1),
  articleTitle: z.string().trim().min(1),
  url: z.string().url(),
  seasonId: z.string().trim().min(1),
  publicationDate: z.string().datetime().optional(),
  sourceType: externalReadingSourceTypeSchema,
});

export type ExternalReading = z.infer<typeof zExternalReading>;

