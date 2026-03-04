import { isSeason1HorrorScope, scopeReasons } from '@/lib/seasons/season1/scope';

export type Season1AuditCandidateMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  genres: string[];
  keywords: string[];
  isCuratedAnchor?: boolean;
  maxNodeScore?: number;
  scopeNodeMin?: number;
  mediaType?: string | null;
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

export function classifySeason1HorrorScope(movie: Pick<Season1AuditCandidateMovie, 'genres' | 'keywords' | 'isCuratedAnchor' | 'maxNodeScore' | 'scopeNodeMin' | 'mediaType'>): Season1ScopeDecision {
  const genres = normalize(movie.genres);
  const keywords = normalize(movie.keywords);
  const reasons = scopeReasons({
    genres,
    keywords,
    isCuratedAnchor: movie.isCuratedAnchor,
    maxNodeScore: movie.maxNodeScore,
    scopeNodeMin: movie.scopeNodeMin,
    mediaType: movie.mediaType,
  });
  return {
    inScope: isSeason1HorrorScope({
      genres,
      keywords,
      isCuratedAnchor: movie.isCuratedAnchor,
      maxNodeScore: movie.maxNodeScore,
      scopeNodeMin: movie.scopeNodeMin,
      mediaType: movie.mediaType,
    }),
    reasons,
  };
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
