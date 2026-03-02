export type EvalRecord = {
  userId: string;
  recommendedMovieIds: number[];
  relevantMovieIds: number[];
};

export type OfflineEvalSummary = {
  userCount: number;
  precisionAt5: number;
  ndcgAt5: number;
  coverageAt5: number;
  noveltyAt5: number;
};

export function precisionAtK(recommendedMovieIds: number[], relevantMovieIds: Set<number>, k: number): number {
  const top = recommendedMovieIds.slice(0, k);
  if (top.length === 0) {
    return 0;
  }
  const hits = top.filter((movieId) => relevantMovieIds.has(movieId)).length;
  return hits / top.length;
}

function dcgAtK(recommendedMovieIds: number[], relevantMovieIds: Set<number>, k: number): number {
  const top = recommendedMovieIds.slice(0, k);
  let score = 0;
  top.forEach((movieId, index) => {
    if (!relevantMovieIds.has(movieId)) {
      return;
    }
    score += 1 / Math.log2(index + 2);
  });
  return score;
}

export function ndcgAtK(recommendedMovieIds: number[], relevantMovieIds: Set<number>, k: number): number {
  const dcg = dcgAtK(recommendedMovieIds, relevantMovieIds, k);
  const idealIds = [...relevantMovieIds].slice(0, k);
  const idcg = dcgAtK(idealIds, new Set(idealIds), k);
  if (idcg === 0) {
    return 0;
  }
  return dcg / idcg;
}

export function coverageAtK(records: EvalRecord[], catalogMovieIds: Set<number>, k: number): number {
  if (catalogMovieIds.size === 0) {
    return 0;
  }
  const uniqueRecommended = new Set<number>();
  records.forEach((record) => {
    record.recommendedMovieIds.slice(0, k).forEach((movieId) => uniqueRecommended.add(movieId));
  });
  return uniqueRecommended.size / catalogMovieIds.size;
}

export function noveltyAtK(records: EvalRecord[], moviePopularityCounts: Map<number, number>, k: number): number {
  let sum = 0;
  let count = 0;
  records.forEach((record) => {
    record.recommendedMovieIds.slice(0, k).forEach((movieId) => {
      const popularity = moviePopularityCounts.get(movieId) ?? 1;
      const surprisal = 1 / Math.log2(2 + popularity);
      sum += surprisal;
      count += 1;
    });
  });
  return count === 0 ? 0 : sum / count;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

export function evaluateOffline(records: EvalRecord[], catalogMovieIds: Set<number>, moviePopularityCounts: Map<number, number>): OfflineEvalSummary {
  if (records.length === 0) {
    return {
      userCount: 0,
      precisionAt5: 0,
      ndcgAt5: 0,
      coverageAt5: 0,
      noveltyAt5: 0,
    };
  }

  const precision = records
    .map((record) => precisionAtK(record.recommendedMovieIds, new Set(record.relevantMovieIds), 5))
    .reduce((a, b) => a + b, 0) / records.length;
  const ndcg = records
    .map((record) => ndcgAtK(record.recommendedMovieIds, new Set(record.relevantMovieIds), 5))
    .reduce((a, b) => a + b, 0) / records.length;

  return {
    userCount: records.length,
    precisionAt5: round4(precision),
    ndcgAt5: round4(ndcg),
    coverageAt5: round4(coverageAtK(records, catalogMovieIds, 5)),
    noveltyAt5: round4(noveltyAtK(records, moviePopularityCounts, 5)),
  };
}

