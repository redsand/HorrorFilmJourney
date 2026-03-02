import type { CandidateMovie } from '@/lib/recommendation/recommendation-engine-v1';

export type StreamingOffer = {
  provider: string;
  type: 'subscription' | 'rent' | 'buy' | 'free';
  url?: string;
  price?: string;
};

export interface StreamingProvider {
  lookup(movie: CandidateMovie, region: string): Promise<StreamingOffer[]>;
}

export class DeterministicStubStreamingProvider implements StreamingProvider {
  async lookup(movie: CandidateMovie, region: string): Promise<StreamingOffer[]> {
    const bucket = movie.tmdbId % 4;

    if (bucket === 0) {
      return [];
    }

    if (bucket === 1) {
      return [
        {
          provider: 'Shudder',
          type: 'subscription',
          url: `https://example.com/${region.toLowerCase()}/movie/${movie.tmdbId}`,
        },
      ];
    }

    if (bucket === 2) {
      return [
        {
          provider: 'Prime Video',
          type: 'rent',
          price: '$3.99',
        },
      ];
    }

    return [
      {
        provider: 'Apple TV',
        type: 'buy',
        price: '$12.99',
      },
      {
        provider: 'Tubi',
        type: 'free',
      },
    ];
  }
}
