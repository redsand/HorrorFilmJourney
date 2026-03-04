export type TmdbRuntimePayload = {
  runtime?: number | null;
};

export function parseTmdbRuntimeMinutes(payload: TmdbRuntimePayload): number | null {
  if (typeof payload.runtime !== 'number' || !Number.isFinite(payload.runtime)) {
    return null;
  }
  const minutes = Math.round(payload.runtime);
  if (minutes <= 0) {
    return null;
  }
  return minutes;
}

export function buildRuntimeRatingUpsert(movieId: string, runtimeMinutes: number): {
  where: { movieId_source: { movieId: string; source: string } };
  create: { movieId: string; source: string; value: number; scale: string; rawValue: string };
  update: { value: number; scale: string; rawValue: string };
} {
  return {
    where: { movieId_source: { movieId, source: 'TMDB_RUNTIME' } },
    create: {
      movieId,
      source: 'TMDB_RUNTIME',
      value: runtimeMinutes,
      scale: 'MINUTES',
      rawValue: `${runtimeMinutes}`,
    },
    update: {
      value: runtimeMinutes,
      scale: 'MINUTES',
      rawValue: `${runtimeMinutes}`,
    },
  };
}

