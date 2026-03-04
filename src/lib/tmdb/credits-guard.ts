export type CastMember = { name: string; role: string };

export type CreditsSnapshot = {
  director: string | null;
  castTop: CastMember[];
};

function normalizeDirector(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCastTop(value: unknown): CastMember[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const name = typeof (entry as { name?: unknown }).name === 'string'
        ? (entry as { name: string }).name.trim()
        : '';
      const role = typeof (entry as { role?: unknown }).role === 'string'
        ? (entry as { role: string }).role.trim()
        : '';
      if (!name) {
        return null;
      }
      return { name, role: role || 'Unknown' };
    })
    .filter((entry): entry is CastMember => entry !== null);
}

export function mergeCreditsWithGuard(input: {
  existingDirector?: string | null;
  existingCastTop?: unknown;
  incomingDirector?: string | null;
  incomingCastTop?: Array<{ name: string; role: string }>;
  forceOverwriteEmpty?: boolean;
}): CreditsSnapshot {
  const forceOverwriteEmpty = input.forceOverwriteEmpty === true;
  const existingDirector = normalizeDirector(input.existingDirector ?? null);
  const incomingDirector = normalizeDirector(input.incomingDirector ?? null);
  const existingCastTop = normalizeCastTop(input.existingCastTop);
  const incomingCastTop = normalizeCastTop(input.incomingCastTop);

  const director = incomingDirector
    ?? (forceOverwriteEmpty ? null : existingDirector);
  const castTop = incomingCastTop.length > 0
    ? incomingCastTop
    : (forceOverwriteEmpty ? [] : existingCastTop);

  return { director, castTop };
}

