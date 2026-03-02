export type StreamingOffer = {
  provider: string;
  type: 'subscription' | 'rent' | 'buy' | 'free';
  url?: string;
  price?: string;
};

export interface StreamingProvider {
  lookup(tmdbId: number, region: string): Promise<StreamingOffer[]>;
}

export class DeterministicStubStreamingProvider implements StreamingProvider {
  async lookup(tmdbId: number, region: string): Promise<StreamingOffer[]> {
    const bucket = tmdbId % 4;

    if (bucket === 0) {
      return [];
    }

    if (bucket === 1) {
      return [
        {
          provider: 'Shudder',
          type: 'subscription',
          url: `https://example.com/${region.toLowerCase()}/movie/${tmdbId}`,
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
