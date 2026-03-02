import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/request-context';

type SpoilerPolicy = 'NO_SPOILERS' | 'LIGHT' | 'FULL';

function normalizeSpoilerPolicy(value: string | null): SpoilerPolicy | null {
  if (!value) {
    return 'NO_SPOILERS';
  }

  if (value === 'NO_SPOILERS' || value === 'LIGHT' || value === 'FULL') {
    return value;
  }

  return null;
}

function buildSections(title: string, year: number | null, spoilerPolicy: SpoilerPolicy) {
  const yearText = year ? ` (${year})` : '';

  const productionNotes = [`${title}${yearText}: notable craft choices and production context without plot specifics.`];
  const historicalNotes = [`Positioned within horror history through style, era, and influence.`];
  const receptionNotes = ['Reception trends can vary across critics and audiences by release window.'];
  const trivia = ['Useful companion prompt: track sound design, framing, and tension rhythm.'];

  if (spoilerPolicy === 'LIGHT') {
    productionNotes.push('Light hint: watch how early setup choices subtly pay off in later scenes.');
    historicalNotes.push('Light hint: thematic framing may echo period-specific social anxieties.');
  }

  if (spoilerPolicy === 'FULL') {
    productionNotes.push('Full mode: includes discussion of late-film structural payoffs and reveals.');
    historicalNotes.push('Full mode: compares ending construction with genre conventions directly.');
    trivia.push('Full mode: spoiler-rich analysis can reference specific twists and outcomes.');
  }

  return {
    productionNotes,
    historicalNotes,
    receptionNotes,
    trivia,
  };
}

export async function GET(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { userId, error } = await getCurrentUserId(request, prisma);
  if (error || !userId) {
    return fail(error ?? { code: 'VALIDATION_ERROR', message: 'Missing X-User-Id header' }, 400);
  }

  const url = new URL(request.url);
  const tmdbIdParam = url.searchParams.get('tmdbId');
  const spoilerPolicy = normalizeSpoilerPolicy(url.searchParams.get('spoilerPolicy'));

  const tmdbId = tmdbIdParam ? Number.parseInt(tmdbIdParam, 10) : NaN;
  if (!Number.isInteger(tmdbId)) {
    return fail({ code: 'VALIDATION_ERROR', message: 'tmdbId is required and must be an integer' }, 400);
  }

  if (!spoilerPolicy) {
    return fail({ code: 'VALIDATION_ERROR', message: 'spoilerPolicy must be NO_SPOILERS, LIGHT, or FULL' }, 400);
  }

  const movie = await prisma.movie.findUnique({
    where: { tmdbId },
    select: {
      id: true,
      tmdbId: true,
      title: true,
      year: true,
      posterUrl: true,
    },
  });

  if (!movie) {
    return fail({ code: 'NOT_FOUND', message: 'Movie not found' }, 404);
  }

  const evidence = await prisma.evidencePacket.findMany({
    where: { movieId: movie.id },
    orderBy: { retrievedAt: 'desc' },
    select: {
      sourceName: true,
      url: true,
      snippet: true,
      retrievedAt: true,
    },
  });

  const sections = buildSections(movie.title, movie.year, spoilerPolicy);

  return ok({
    movie: {
      tmdbId: movie.tmdbId,
      title: movie.title,
      ...(movie.year ? { year: movie.year } : {}),
      posterUrl: movie.posterUrl,
    },
    credits: {
      cast: [],
    },
    sections,
    spoilerPolicy,
    evidence,
  });
}
