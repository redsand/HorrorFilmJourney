import type { PrismaClient } from '@prisma/client';
import { streamingOptionSchema } from '@/lib/contracts/narrative-contracts';
import type { CandidateMovie } from '@/lib/recommendation/recommendation-engine-v1';
import type { StreamingOffer, StreamingProvider } from '@/lib/streaming/streaming-provider';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const STREAMING_CACHE_TTL_MS = 7 * ONE_DAY_MS;
const DEFAULT_REGION = 'US';

function normalizeOffers(value: unknown): StreamingOffer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((offer) => streamingOptionSchema.safeParse(offer))
    .filter((parsed): parsed is { success: true; data: StreamingOffer } => parsed.success)
    .map((parsed) => parsed.data);
}

export class CachedStreamingLookupService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: StreamingProvider,
  ) {}

  async getForMovie(movie: CandidateMovie, region: string = DEFAULT_REGION): Promise<{ region: string; offers: StreamingOffer[] }> {
    const now = new Date();
    const cached = await this.prisma.movieStreamingCache.findUnique({
      where: {
        movieId_region: {
          movieId: movie.id,
          region,
        },
      },
    });

    if (cached && now.getTime() - cached.fetchedAt.getTime() < STREAMING_CACHE_TTL_MS) {
      return { region, offers: normalizeOffers(cached.offers) };
    }

    let offers: StreamingOffer[];
    try {
      offers = normalizeOffers(await this.provider.lookup(movie.tmdbId, region));
    } catch {
      offers = [];
    }
    await this.prisma.movieStreamingCache.upsert({
      where: {
        movieId_region: {
          movieId: movie.id,
          region,
        },
      },
      create: {
        movieId: movie.id,
        region,
        offers,
        fetchedAt: now,
      },
      update: {
        offers,
        fetchedAt: now,
      },
    });

    return { region, offers };
  }
}

// Backward-compatible alias while callers migrate to CachedStreamingLookupService.
export class StreamingLookupService extends CachedStreamingLookupService {}
