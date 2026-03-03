import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type CurriculumSpec = {
  nodes: Array<{
    slug: string;
    titles: Array<{ title: string; year: number; altTitle?: string }>;
  }>;
};

type CliOptions = {
  apply: boolean;
  force: boolean;
  minPerNode: number;
  enforceMinPerNode: boolean;
  enforceBalance: boolean;
};

function parseCliArgs(): CliOptions {
  const args = new Set(process.argv.slice(2));
  const minRaw = process.env.SEASON2_MIN_ELIGIBLE_PER_NODE;
  const parsedMin = minRaw ? Number.parseInt(minRaw, 10) : 30;
  return {
    apply: args.has('--apply'),
    force: args.has('--force'),
    minPerNode: Number.isFinite(parsedMin) && parsedMin > 0 ? parsedMin : 30,
    enforceMinPerNode: process.env.SEASON2_ENFORCE_MIN_PER_NODE === 'true',
    enforceBalance: process.env.SEASON2_ENFORCE_BALANCE === 'true',
  };
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseYearCap(): number {
  const raw = process.env.SEASON2_MAX_YEAR;
  const parsed = raw ? Number.parseInt(raw, 10) : 2010;
  return Number.isFinite(parsed) ? parsed : 2010;
}

function titleMatchesAssigned(specTitle: string, assignedTitle: string): boolean {
  const a = normalizeTitle(specTitle);
  const b = normalizeTitle(assignedTitle);
  const aliases: Record<string, string[]> = {
    'i spit on your grave': ['day of the woman'],
    tenebrae: ['tenebre'],
  };
  if (a === b) {
    return true;
  }
  if ((aliases[a] ?? []).some((alias) => normalizeTitle(alias) === b)) {
    return true;
  }
  if ((aliases[b] ?? []).some((alias) => normalizeTitle(alias) === a)) {
    return true;
  }
  if (a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a))) {
    return true;
  }
  return false;
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const prisma = new PrismaClient();

  try {
    const season2 = await prisma.season.findUnique({
      where: { slug: 'season-2' },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
      },
    });
    if (!season2) {
      throw new Error('season-2 not found. Seed seasons before publish.');
    }

    const cultPack = await prisma.genrePack.findUnique({
      where: { slug: 'cult-classics' },
      select: {
        id: true,
        slug: true,
        name: true,
        seasonId: true,
        isEnabled: true,
      },
    });
    if (!cultPack || cultPack.seasonId !== season2.id) {
      throw new Error('cult-classics pack is missing or not linked to season-2.');
    }

    const nodes = await prisma.journeyNode.findMany({
      where: { packId: cultPack.id },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        movies: {
          select: {
            movie: {
              select: {
                title: true,
                year: true,
              },
            },
          },
        },
        _count: { select: { movies: true } },
      },
    });

    if (nodes.length !== 8 && !options.force) {
      throw new Error(`Expected 8 JourneyNodes for cult-classics, found ${nodes.length}. Use --force to override.`);
    }

    const nodeCounts = nodes.map((node) => ({
      slug: node.slug,
      name: node.name,
      count: node._count.movies,
      meetsThreshold: node._count.movies >= options.minPerNode,
    }));

    const belowThreshold = nodeCounts.filter((node) => !node.meetsThreshold);
    if (options.enforceMinPerNode && belowThreshold.length > 0 && !options.force) {
      const summary = belowThreshold.map((node) => `${node.slug}:${node.count}`).join(', ');
      throw new Error(
        `Season 2 quality gate failed (min ${options.minPerNode} per node). Below threshold: ${summary}. Use --force to override.`,
      );
    }

    const minCount = nodeCounts.reduce((acc, node) => Math.min(acc, node.count), Number.MAX_SAFE_INTEGER);
    const maxCount = nodeCounts.reduce((acc, node) => Math.max(acc, node.count), 0);
    const spread = nodeCounts.length > 0 ? maxCount - minCount : 0;
    if (options.enforceBalance && spread > 0 && !options.force) {
      throw new Error(
        `Season 2 balance gate failed (node spread ${spread}). Set SEASON2_ENFORCE_BALANCE=false to allow imbalance, or use --force.`,
      );
    }

    const assignmentTotal = nodeCounts.reduce((sum, node) => sum + node.count, 0);
    const specPath = resolve('docs/season/season-2-cult-classics-curriculum.json');
    const spec = JSON.parse(await readFile(specPath, 'utf8')) as CurriculumSpec;
    const specNodeBySlug = new Map(spec.nodes.map((node) => [node.slug, node] as const));
    const maxYear = parseYearCap();
    const missingByNode: Array<{ slug: string; missing: Array<{ title: string; year: number }> }> = [];
    for (const node of nodes) {
      const specNode = specNodeBySlug.get(node.slug);
      if (!specNode) {
        continue;
      }
      const assignedTitles = node.movies.map((entry) => entry.movie.title);
      const missing = specNode.titles
        .filter((title) => title.year <= maxYear)
        .filter((title) => {
          const primaryHit = assignedTitles.some((assigned) => titleMatchesAssigned(title.title, assigned));
          const altHit = title.altTitle
            ? assignedTitles.some((assigned) => titleMatchesAssigned(title.altTitle as string, assigned))
            : false;
          return !primaryHit && !altHit;
        })
        .map((title) => ({ title: title.title, year: title.year }));
      if (missing.length > 0) {
        missingByNode.push({ slug: node.slug, missing });
      }
    }
    if (missingByNode.length > 0 && !options.force) {
      const summary = missingByNode
        .map((entry) => `${entry.slug}:${entry.missing.length}`)
        .join(', ');
      throw new Error(
        `Season 2 list-completeness gate failed (policy year<=${maxYear}). Missing curriculum titles by node: ${summary}. Use --force to override.`,
      );
    }
    console.log(
      `[season2.publish] readiness: nodes=${nodes.length} assignments=${assignmentTotal} minPerNode=${options.minPerNode} enforceMinPerNode=${options.enforceMinPerNode} enforceBalance=${options.enforceBalance} spread=${spread}`,
    );
    nodeCounts.forEach((node) => {
      console.log(`[season2.publish] node ${node.slug}: ${node.count} ${node.meetsThreshold ? 'OK' : 'LOW'}`);
    });

    if (!options.apply) {
      console.log('[season2.publish] dry run only. Re-run with --apply to activate season-2 and enable cult-classics.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.season.updateMany({
        data: { isActive: false },
      });
      await tx.season.update({
        where: { id: season2.id },
        data: { isActive: true },
      });
      await tx.genrePack.update({
        where: { id: cultPack.id },
        data: { isEnabled: true },
      });
    });

    const profiles = await prisma.userProfile.findMany({
      select: {
        id: true,
        selectedPackId: true,
        selectedPack: {
          select: {
            id: true,
            season: { select: { isActive: true } },
          },
        },
      },
    });

    let updatedProfiles = 0;
    for (const profile of profiles) {
      const shouldMove = !profile.selectedPackId || !profile.selectedPack || !profile.selectedPack.season.isActive;
      if (!shouldMove) {
        continue;
      }
      await prisma.userProfile.update({
        where: { id: profile.id },
        data: { selectedPackId: cultPack.id },
      });
      updatedProfiles += 1;
    }

    console.log(
      `[season2.publish] published: activeSeason=season-2 pack=cult-classics profilesUpdated=${updatedProfiles}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[season2.publish] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
