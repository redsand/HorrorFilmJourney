export type DeterministicCatalogMovie = {
  tmdbId: number;
  title: string;
  year: number;
  posterUrl: string;
  synopsis: string | null;
  genres: string[];
  keywords: string[];
  country: string | null;
  director: string | null;
  castTop: Array<{ name: string; role?: string }>;
  ratings: Array<{ source: string; value: number; scale: string; rawValue?: string | null }>;
};

const DETERMINISTIC_TMDB_BACKFILLS = new Map<number, DeterministicCatalogMovie>([
  [
    778000,
    {
      tmdbId: 778000,
      title: 'Naked Blood',
      year: 1996,
      posterUrl: 'https://image.tmdb.org/t/p/w500/yCLPovhiuoiKoN3JLUAlKQ7D5SL.jpg',
      synopsis:
        "A scientist taints his mother's experiment with a drug that turns pain into pleasure, with horrific results.",
      genres: ['horror', 'science fiction'],
      keywords: ['gore'],
      country: 'Japan',
      director: 'Hisayasu Sato',
      castTop: [
        { name: 'Misa Aika', role: 'Rika Mikami' },
        { name: 'Yumika Hayashi', role: 'Gluttonous Woman' },
        { name: 'Mika Kirihara', role: 'Vain Woman' },
      ],
      ratings: [
        { source: 'TMDB', value: 5.7, scale: '10', rawValue: '5.7/10' },
        { source: 'TMDB_VOTE_COUNT', value: 73, scale: 'COUNT', rawValue: '73' },
      ],
    },
  ],
]);

export function getDeterministicCatalogBackfill(tmdbId: number): DeterministicCatalogMovie | null {
  return DETERMINISTIC_TMDB_BACKFILLS.get(tmdbId) ?? null;
}

export function listDeterministicCatalogBackfills(): DeterministicCatalogMovie[] {
  return [...DETERMINISTIC_TMDB_BACKFILLS.values()];
}
