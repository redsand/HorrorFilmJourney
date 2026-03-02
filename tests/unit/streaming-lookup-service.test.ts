import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { StreamingLookupService, STREAMING_CACHE_TTL_MS } from '@/lib/streaming/streaming-lookup-service';
import type { StreamingProvider } from '@/lib/streaming/streaming-provider';
import type { CandidateMovie } from '@/lib/recommendation/recommendation-engine-v1';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('streaming_lookup_service_test');
const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

const movieFixture: CandidateMovie = {
  id: 'fixture-movie-id',
  tmdbId: 999,
  title: 'Fixture Movie',
  year: 1999,
  posterUrl: 'https://img/fixture.jpg',
  genres: ['horror'],
  ratings: {
    imdb: { value: 7.7, scale: '10' },
    additional: [{ source: 'ROTTEN_TOMATOES', value: 80, scale: '100' }],
  },
};

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  await prisma.movieStreamingCache.deleteMany();
  await prisma.movieRating.deleteMany();
  await prisma.movie.deleteMany();

  await prisma.movie.create({
    data: {
      id: movieFixture.id,
      tmdbId: movieFixture.tmdbId,
      title: movieFixture.title,
      year: movieFixture.year,
      posterUrl: movieFixture.posterUrl,
      genres: movieFixture.genres,
    },
  });
});

describe('StreamingLookupService TTL caching', () => {
  it('does not call provider when cache is fresh', async () => {
    const provider: StreamingProvider = {
      lookup: vi.fn().mockResolvedValue([{ provider: 'Should Not Be Called', type: 'free' }]),
    };

    const now = new Date();
    await prisma.movieStreamingCache.create({
      data: {
        movieId: movieFixture.id,
        region: 'US',
        offers: [{ provider: 'Cached Provider', type: 'subscription' }],
        fetchedAt: new Date(now.getTime() - STREAMING_CACHE_TTL_MS + 60_000),
      },
    });

    const service = new StreamingLookupService(prisma, provider);
    const result = await service.getForMovie(movieFixture);

    expect(provider.lookup).not.toHaveBeenCalled();
    expect(result.region).toBe('US');
    expect(result.offers).toEqual([{ provider: 'Cached Provider', type: 'subscription' }]);
  });

  it('calls provider and updates cache when cache is stale', async () => {
    const provider: StreamingProvider = {
      lookup: vi.fn().mockResolvedValue([{ provider: 'Fresh Provider', type: 'rent', price: '$4.99' }]),
    };

    await prisma.movieStreamingCache.create({
      data: {
        movieId: movieFixture.id,
        region: 'US',
        offers: [{ provider: 'Stale Provider', type: 'buy', price: '$14.99' }],
        fetchedAt: new Date(Date.now() - STREAMING_CACHE_TTL_MS - 60_000),
      },
    });

    const service = new StreamingLookupService(prisma, provider);
    const result = await service.getForMovie(movieFixture, 'US');

    expect(provider.lookup).toHaveBeenCalledTimes(1);
    expect(result.offers).toEqual([{ provider: 'Fresh Provider', type: 'rent', price: '$4.99' }]);

    const cached = await prisma.movieStreamingCache.findUnique({
      where: { movieId_region: { movieId: movieFixture.id, region: 'US' } },
    });

    expect(cached).not.toBeNull();
    expect(cached?.offers).toEqual([{ provider: 'Fresh Provider', type: 'rent', price: '$4.99' }]);
    expect(cached && cached.fetchedAt.getTime() > Date.now() - 60_000).toBe(true);
  });

  it('returns empty offers when provider fails', async () => {
    const provider: StreamingProvider = {
      lookup: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };

    const service = new StreamingLookupService(prisma, provider);
    const result = await service.getForMovie(movieFixture, 'US');

    expect(provider.lookup).toHaveBeenCalledTimes(1);
    expect(result.region).toBe('US');
    expect(result.offers).toEqual([]);

    const cached = await prisma.movieStreamingCache.findUnique({
      where: { movieId_region: { movieId: movieFixture.id, region: 'US' } },
    });
    expect(cached).not.toBeNull();
    expect(cached?.offers).toEqual([]);
  });
});
