/**
 * fix-season3-pre-publish.ts
 *
 * Resolves snapshot warnings before publishing:
 *   1. De-duplicate ranks within each node (stable sort: curriculum-qa-fix sources first, then by original rank)
 *   2. Remove Metropolis (tmdb:19) from retrofuturism-steampunk-dieselpunk
 *      — governance disallows proto-science-fiction ↔ retrofuturism overlap
 *   3. Regenerate docs/season/season-3-sci-fi-mastered.json from current DB
 *   4. Update season-integrity-registry.json snapshotPath to the mastered file
 */

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();
const TAXONOMY   = 'season-3-sci-fi-v1';
const PACK_SLUG  = 'sci-fi';
const SEASON_SLUG = 'season-3';
const MASTERED_PATH  = path.resolve('docs/season/season-3-sci-fi-mastered.json');
const REGISTRY_PATH  = path.resolve('docs/season/season-integrity-registry.json');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (DRY_RUN) console.log('-- DRY RUN --\n');

  const pack = await prisma.genrePack.findUnique({
    where: { slug: PACK_SLUG },
    select: { id: true },
  });
  if (!pack) throw new Error(`Pack "${PACK_SLUG}" not found`);

  const nodes = await prisma.journeyNode.findMany({
    where: { packId: pack.id },
    select: { id: true, slug: true, orderIndex: true },
    orderBy: { orderIndex: 'asc' },
  });

  // ── FIX 1: Remove Metropolis from retrofuturism (governance disallowed pair) ─
  console.log('FIX 1: Remove Metropolis (tmdb:19) from retrofuturism-steampunk-dieselpunk');
  const metropolis = await prisma.movie.findUnique({ where: { tmdbId: 19 }, select: { id: true } });
  const retroNode  = nodes.find(n => n.slug === 'retrofuturism-steampunk-dieselpunk');
  if (metropolis && retroNode) {
    const existing = await prisma.nodeMovie.findUnique({
      where: { nodeId_movieId: { nodeId: retroNode.id, movieId: metropolis.id } },
    });
    if (existing) {
      if (!DRY_RUN) {
        await prisma.nodeMovie.delete({ where: { nodeId_movieId: { nodeId: retroNode.id, movieId: metropolis.id } } });
      }
      console.log(`  ✅ Deleted Metropolis from retrofuturism (rank was ${existing.rank})`);
    } else {
      console.log('  ✅ Metropolis already not in retrofuturism');
    }
  } else {
    console.log('  ⚠️  Metropolis or retrofuturism node not found');
  }

  // ── FIX 2: De-duplicate ranks within each node ────────────────────────────────
  console.log('\nFIX 2: De-duplicate ranks within each node');
  let totalUpdated = 0;

  for (const node of nodes) {
    const movies = await prisma.nodeMovie.findMany({
      where: { nodeId: node.id, taxonomyVersion: TAXONOMY },
      select: { id: true, rank: true, coreRank: true, source: true, movie: { select: { tmdbId: true, title: true } } },
    });

    // Stable sort: curriculum-qa-fix (canonical anchors) sort by rank ASC first,
    // then original seed films by rank ASC
    const canonicals = movies.filter(m => m.source === 'curriculum-qa-fix').sort((a, b) => a.rank - b.rank);
    const originals  = movies.filter(m => m.source !== 'curriculum-qa-fix').sort((a, b) => a.rank - b.rank);

    // Assign new sequential ranks: canonicals get 1..N, originals get N+1..M
    // But avoid displacing originals that already have low ranks if they're not canonical
    // Strategy: interleave — put canonical at their target rank, shift others
    const sorted = [...canonicals, ...originals];
    const newRanks = sorted.map((_, i) => i + 1);

    let nodeUpdates = 0;
    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i];
      const newRank = newRanks[i];
      if (m.rank !== newRank) {
        if (!DRY_RUN) {
          await prisma.nodeMovie.update({ where: { id: m.id }, data: { rank: newRank } });
        }
        nodeUpdates++;
      }
    }
    if (nodeUpdates > 0) {
      console.log(`  ${node.slug.padEnd(46)} re-ranked ${nodeUpdates} films  (${canonicals.length} canonicals → ranks 1–${canonicals.length})`);
      totalUpdated += nodeUpdates;
    }
  }
  console.log(`  Total rank updates: ${totalUpdated}`);

  // ── FIX 3: Regenerate mastered.json from current DB ───────────────────────────
  console.log('\nFIX 3: Regenerate season-3-sci-fi-mastered.json');

  const season = await prisma.season.findUnique({ where: { slug: SEASON_SLUG }, select: { id: true } });
  if (!season) throw new Error('Season not found');

  // Re-fetch with updated ranks
  const allAssignments = await prisma.nodeMovie.findMany({
    where: {
      node: { packId: pack.id },
      taxonomyVersion: TAXONOMY,
      tier: 'CORE',
    },
    include: {
      node: { select: { slug: true, orderIndex: true } },
      movie: { select: { tmdbId: true, title: true, year: true } },
    },
    orderBy: [
      { node: { orderIndex: 'asc' } },
      { rank: 'asc' },
    ],
  });

  // Group by node
  const byNode = new Map<string, { orderIndex: number; core: Array<{ tmdbId: number; title: string; year: number | null }> }>();
  for (const a of allAssignments) {
    const slug = a.node.slug;
    if (!byNode.has(slug)) byNode.set(slug, { orderIndex: a.node.orderIndex, core: [] });
    byNode.get(slug)!.core.push({ tmdbId: a.movie.tmdbId, title: a.movie.title, year: a.movie.year });
  }

  const uniqueMovies = new Set(allAssignments.map(a => a.movie.tmdbId));
  const mastered = {
    season: 'sci-fi',
    taxonomyVersion: TAXONOMY,
    summary: {
      coreCount: allAssignments.length,
      extendedCount: 0,
      totalUnique: uniqueMovies.size,
    },
    nodes: [...byNode.entries()]
      .sort((a, b) => a[1].orderIndex - b[1].orderIndex)
      .map(([slug, data]) => ({
        slug,
        core: data.core,
        extended: [] as unknown[],
      })),
    status: 'final',
    finalizedAt: new Date().toISOString(),
  };

  if (!DRY_RUN) {
    await fs.writeFile(MASTERED_PATH, JSON.stringify(mastered, null, 2) + '\n', 'utf8');
  }
  console.log(`  ✅ ${DRY_RUN ? '[dry-run] would write' : 'Wrote'} ${MASTERED_PATH}`);
  console.log(`     nodes: ${mastered.nodes.length}  coreCount: ${mastered.summary.coreCount}  uniqueMovies: ${mastered.summary.totalUnique}`);

  // ── FIX 4: Update registry snapshotPath if pointing to template ───────────────
  console.log('\nFIX 4: Update season-integrity-registry.json');
  const registryRaw = await fs.readFile(REGISTRY_PATH, 'utf8');
  const registry = JSON.parse(registryRaw) as { seasons: Array<{ seasonSlug: string; snapshotPath: string }> };
  const s3entry = registry.seasons.find(s => s.seasonSlug === SEASON_SLUG);
  if (s3entry) {
    const currentPath = s3entry.snapshotPath;
    const targetPath  = 'docs/season/season-3-sci-fi-mastered.json';
    if (currentPath !== targetPath) {
      s3entry.snapshotPath = targetPath;
      if (!DRY_RUN) {
        await fs.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
      }
      console.log(`  ✅ Updated snapshotPath: "${currentPath}" → "${targetPath}"`);
    } else {
      console.log(`  ✅ snapshotPath already correct: "${targetPath}"`);
    }
  }

  console.log('\nDone.');
}

main()
  .catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
