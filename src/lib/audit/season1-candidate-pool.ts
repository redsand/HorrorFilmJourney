export type Season1AuditCandidateMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  genres: string[];
  keywords: string[];
  metrics: {
    voteCount: number;
    hybridScore: number;
    rating: number;
    popularity: number;
    journeyScore: number;
  };
};

export type Season1ScopeDecision = {
  inScope: boolean;
  reasons: string[];
};

function normalize(values: string[]): string[] {
  return values.map((v) => v.trim().toLowerCase()).filter((v) => v.length > 0);
}

export function classifySeason1HorrorScope(movie: Pick<Season1AuditCandidateMovie, 'genres' | 'keywords'>): Season1ScopeDecision {
  const genres = normalize(movie.genres);
  const keywords = normalize(movie.keywords);
  const reasons: string[] = [];

  const hasHorrorGenre = genres.some((genre) => genre === 'horror' || genre.includes('horror'));
  if (hasHorrorGenre) {
    reasons.push('genre:horror');
    return { inScope: true, reasons };
  }

  if (keywords.some((kw) => kw === 'horror' || kw.includes('horror'))) {
    reasons.push('keyword:horror_only_without_genre');
  } else {
    reasons.push('no_horror_genre');
  }
  return { inScope: false, reasons };
}

export type Season1CandidatePoolRow = Season1AuditCandidateMovie & {
  scope: Season1ScopeDecision;
};

export function getSeason1CandidatePool(rows: Season1AuditCandidateMovie[]): Season1CandidatePoolRow[] {
  return rows
    .map((row) => ({
      ...row,
      scope: classifySeason1HorrorScope(row),
    }))
    .filter((row) => row.scope.inScope)
    .sort((a, b) => (a.tmdbId - b.tmdbId) || a.id.localeCompare(b.id));
}
