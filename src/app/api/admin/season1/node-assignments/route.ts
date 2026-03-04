import { z } from 'zod';
import { fail, ok } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

const actionSchema = z.object({
  action: z.enum(['accept', 'reject', 'override']),
  nodeSlug: z.string().min(1),
  tmdbId: z.number().int().positive(),
  score: z.number().min(0).max(1).optional(),
  rationale: z.string().trim().max(280).optional(),
});

async function resolveSeason1Pack() {
  const season = await prisma.season.findUnique({
    where: { slug: 'season-1' },
    select: { id: true, packs: { where: { slug: 'horror' }, select: { id: true } } },
  });
  if (!season || season.packs.length === 0) {
    return null;
  }
  return { seasonId: season.id, packId: season.packs[0]!.id };
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const pack = await resolveSeason1Pack();
  if (!pack) {
    return fail({ code: 'NOT_FOUND', message: 'Season 1 horror pack not found' }, 404);
  }

  const url = new URL(request.url);
  const nodeSlug = url.searchParams.get('nodeSlug')?.trim() || null;
  const source = url.searchParams.get('source')?.trim() || null;
  const limit = Math.max(1, Math.min(500, Number.parseInt(url.searchParams.get('limit') ?? '150', 10) || 150));

  const rows = await prisma.nodeMovie.findMany({
    where: {
      node: {
        packId: pack.packId,
        ...(nodeSlug ? { slug: nodeSlug } : {}),
      },
      ...(source ? { source } : {}),
    },
    orderBy: [{ node: { orderIndex: 'asc' } }, { tier: 'asc' }, { coreRank: 'asc' }, { rank: 'asc' }],
    take: limit,
    select: {
      id: true,
      rank: true,
      tier: true,
      coreRank: true,
      source: true,
      score: true,
      finalScore: true,
      journeyScore: true,
      runId: true,
      taxonomyVersion: true,
      evidence: true,
      node: { select: { slug: true, name: true } },
      movie: { select: { tmdbId: true, title: true, year: true } },
    },
  });

  return ok({
    items: rows.map((row) => ({
      id: row.id,
      nodeSlug: row.node.slug,
      nodeName: row.node.name,
      tmdbId: row.movie.tmdbId,
      title: row.movie.title,
      year: row.movie.year,
      rank: row.rank,
      tier: row.tier.toLowerCase(),
      coreRank: row.coreRank,
      source: row.source,
      score: row.score,
      finalScore: row.finalScore,
      journeyScore: row.journeyScore,
      runId: row.runId,
      taxonomyVersion: row.taxonomyVersion,
      evidence: row.evidence,
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdmin(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return fail({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload' }, 400);
  }

  const pack = await resolveSeason1Pack();
  if (!pack) {
    return fail({ code: 'NOT_FOUND', message: 'Season 1 horror pack not found' }, 404);
  }

  const node = await prisma.journeyNode.findFirst({
    where: { packId: pack.packId, slug: parsed.data.nodeSlug },
    select: { id: true, taxonomyVersion: true },
  });
  if (!node) {
    return fail({ code: 'NOT_FOUND', message: 'Node not found' }, 404);
  }

  const movie = await prisma.movie.findUnique({
    where: { tmdbId: parsed.data.tmdbId },
    select: { id: true },
  });
  if (!movie) {
    return fail({ code: 'NOT_FOUND', message: 'Movie not found' }, 404);
  }

  const runId = `admin-review-${new Date().toISOString()}`;
  const rationale = parsed.data.rationale?.trim();
  const decisionEvidence = {
    decision: parsed.data.action,
    by: auth.userId,
    rationale: rationale || null,
  };

  if (parsed.data.action === 'reject') {
    await prisma.nodeMovie.deleteMany({
      where: {
        nodeId: node.id,
        movieId: movie.id,
      },
    });
    return ok({ status: 'rejected' });
  }

  const currentMaxRank = await prisma.nodeMovie.findFirst({
    where: { nodeId: node.id, tier: 'CORE' },
    orderBy: { coreRank: 'desc' },
    select: { coreRank: true },
  });
  const nextRank = (currentMaxRank?.coreRank ?? 0) + 1;

  await prisma.nodeMovie.upsert({
    where: {
      nodeId_movieId: {
        nodeId: node.id,
        movieId: movie.id,
      },
    },
    create: {
      nodeId: node.id,
      movieId: movie.id,
      rank: nextRank,
      tier: 'CORE',
      coreRank: nextRank,
      source: 'override',
      score: parsed.data.score ?? 1,
      finalScore: parsed.data.score ?? 1,
      journeyScore: 1,
      evidence: decisionEvidence,
      runId,
      taxonomyVersion: node.taxonomyVersion,
    },
    update: {
      source: 'override',
      score: parsed.data.score ?? 1,
      tier: 'CORE',
      coreRank: nextRank,
      finalScore: parsed.data.score ?? 1,
      journeyScore: 1,
      evidence: decisionEvidence,
      runId,
      taxonomyVersion: node.taxonomyVersion,
    },
  });

  return ok({ status: parsed.data.action === 'accept' ? 'accepted' : 'overridden' });
}
