export type DiscoverPlan = {
  key: string;
  label: string;
  withGenres: number[];
  withoutGenres?: number[];
  sortBy: 'popularity.desc' | 'vote_count.desc' | 'vote_average.desc';
  voteCountGte: number;
};

export const TMDB_GENRE = {
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  DRAMA: 18,
  FANTASY: 14,
  HORROR: 27,
  MYSTERY: 9648,
  SCIENCE_FICTION: 878,
  THRILLER: 53,
  WAR: 10752,
} as const;

export const SCI_FI_PRIMARY_GENRES: number[] = [
  TMDB_GENRE.SCIENCE_FICTION,
];

export const SCI_FI_ADJACENT_GENRES: number[] = [
  TMDB_GENRE.ACTION,
  TMDB_GENRE.ADVENTURE,
  TMDB_GENRE.FANTASY,
  TMDB_GENRE.HORROR,
  TMDB_GENRE.MYSTERY,
  TMDB_GENRE.THRILLER,
  TMDB_GENRE.DRAMA,
  TMDB_GENRE.WAR,
];

export function getSeason3SciFiDiscoverPlans(): DiscoverPlan[] {
  return [
    {
      key: 'core-sci-fi-vote-count',
      label: 'Core sci-fi by vote count',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      sortBy: 'vote_count.desc',
      voteCountGte: 50,
    },
    {
      key: 'core-sci-fi-popularity',
      label: 'Core sci-fi by popularity',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION],
      sortBy: 'popularity.desc',
      voteCountGte: 20,
    },
    {
      key: 'sci-fi-horror',
      label: 'Sci-fi and horror crossover',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION, TMDB_GENRE.HORROR],
      sortBy: 'vote_count.desc',
      voteCountGte: 20,
    },
    {
      key: 'sci-fi-thriller-mystery',
      label: 'Sci-fi thriller and mystery crossover',
      withGenres: [TMDB_GENRE.SCIENCE_FICTION, TMDB_GENRE.THRILLER, TMDB_GENRE.MYSTERY],
      sortBy: 'vote_count.desc',
      voteCountGte: 10,
    },
    {
      key: 'adjacent-genre-sweep',
      label: 'Adjacent genres with sci-fi signal, excluding animation',
      withGenres: [...SCI_FI_ADJACENT_GENRES],
      withoutGenres: [TMDB_GENRE.ANIMATION],
      sortBy: 'popularity.desc',
      voteCountGte: 30,
    },
  ];
}

