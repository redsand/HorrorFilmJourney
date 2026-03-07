/**
 * stratify-season3-tiers.ts
 *
 * Two operations:
 *
 * A) Tier stratification
 *    Rank 1–20 per node  → CORE   (curated, canonical-first)
 *    Rank 21+  per node  → EXTENDED
 *
 * B) Resolve multi-node films
 *    Five films currently span 3+ nodes.
 *    Each is pinned to exactly one canonical node; assignments to all others deleted.
 *
 *    2001: A Space Odyssey  → hard-science-fiction
 *    Blade Runner            → cyberpunk
 *    Children of Men         → dystopian-science-fiction
 *    The Thing               → science-fiction-horror
 *    Annihilation            → new-weird-cosmic-science-fiction
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TAXONOMY  = 'season-3-sci-fi-v1';
const PACK_SLUG = 'sci-fi';
const CORE_CUTOFF = 20;
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Multi-node resolution: film → single canonical node ─────────────────────
const SINGLE_NODE_MAP: { tmdbId: number; title: string; keepNode: string; rationale: string }[] = [
  {
    tmdbId: 62,
    title: '2001: A Space Odyssey',
    keepNode: 'hard-science-fiction',
    rationale: 'Defining hard-SF work; HAL and cosmic journey are expressions of scientific rigor, not cybernetic or space-opera concerns',
  },
  {
    tmdbId: 78,
    title: 'Blade Runner',
    keepNode: 'cyberpunk',
    rationale: 'The genre\'s founding text; dystopian and AI readings are downstream of its cyberpunk worldbuilding',
  },
  {
    tmdbId: 9693,
    title: 'Children of Men',
    keepNode: 'dystopian-science-fiction',
    rationale: 'Primarily a dystopian film; the time-travel assignment was mis-categorisation by the seed algorithm',
  },
  {
    tmdbId: 1091,
    title: 'The Thing',
    keepNode: 'science-fiction-horror',
    rationale: 'Canonical sf-horror; alien-contact is a framing device, alternate-history was a seed error',
  },
  {
    tmdbId: 300668,
    title: 'Annihilation',
    keepNode: 'new-weird-cosmic-science-fiction',
    rationale: 'The Shimmer is cosmic-weird, not biological; biopunk and sf-horror are aspects, not the primary genre register',
  },
];

async function main() {
  if (DRY_RUN) console.log('-- DRY RUN — no DB writes --\n');

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
  const nodeIdBySlug = new Map(nodes.map(n => [n.slug, n.id]));

  // ── OPERATION A: Resolve multi-node films ────────────────────────────────────
  console.log('OPERATION A: Resolve multi-node films');
  console.log('─'.repeat(60));

  for (const film of SINGLE_NODE_MAP) {
    const movie = await prisma.movie.findUnique({
      where: { tmdbId: film.tmdbId },
      select: { id: true, title: true, year: true },
    });
    if (!movie) {
      console.log(`  ⚠️  NOT FOUND: tmdb:${film.tmdbId} "${film.title}"`);
      continue;
    }

    const allAssignments = await prisma.nodeMovie.findMany({
      where: {
        movieId: movie.id,
        node: { packId: pack.id },
        taxonomyVersion: TAXONOMY,
      },
      include: { node: { select: { slug: true } } },
    });

    const keepNodeId = nodeIdBySlug.get(film.keepNode);
    if (!keepNodeId) {
      console.log(`  ⚠️  Keep-node not found: "${film.keepNode}"`);
      continue;
    }

    // Ensure the film is in the keep-node (should already be there from canonical fix)
    const inKeepNode = allAssignments.find(a => a.node.slug === film.keepNode);
    if (!inKeepNode) {
      console.log(`  ⚠️  "${film.title}" is NOT in "${film.keepNode}" — skipping removal of other nodes to avoid data loss`);
      continue;
    }

    const toRemove = allAssignments.filter(a => a.node.slug !== film.keepNode);
    if (toRemove.length === 0) {
      console.log(`  ✅ "${film.title}" already only in "${film.keepNode}"`);
      continue;
    }

    console.log(`  "${film.title}" (tmdb:${film.tmdbId})`);
    console.log(`     Keep: ${film.keepNode} (rank=${inKeepNode.rank})`);
    console.log(`     Remove from (${toRemove.length}): ${toRemove.map(a => a.node.slug).join(', ')}`);
    console.log(`     Rationale: ${film.rationale}`);

    if (!DRY_RUN) {
      for (const a of toRemove) {
        await prisma.nodeMovie.delete({ where: { id: a.id } });
      }
    }
  }

  // ── OPERATION B: Tier stratification ─────────────────────────────────────────
  console.log(`\nOPERATION B: Tier stratification (top ${CORE_CUTOFF} → CORE, rest → EXTENDED)`);
  console.log('─'.repeat(60));

  let totalCore = 0; let totalExtended = 0;
  const nodeResults: { slug: string; core: number; extended: number }[] = [];

  for (const node of nodes) {
    // Get all assignments for this node ordered by rank (canonicals are ranks 1–N)
    const assignments = await prisma.nodeMovie.findMany({
      where: { nodeId: node.id, taxonomyVersion: TAXONOMY },
      orderBy: { rank: 'asc' },
      select: { id: true, rank: true, tier: true, source: true, movie: { select: { title: true, tmdbId: true } } },
    });

    const coreIds: string[]     = [];
    const extendedIds: string[] = [];

    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (i < CORE_CUTOFF) {
        coreIds.push(a.id);
      } else {
        extendedIds.push(a.id);
      }
    }

    if (!DRY_RUN) {
      if (coreIds.length > 0) {
        await prisma.nodeMovie.updateMany({
          where: { id: { in: coreIds } },
          data: { tier: 'CORE' },
        });
      }
      if (extendedIds.length > 0) {
        await prisma.nodeMovie.updateMany({
          where: { id: { in: extendedIds } },
          data: { tier: 'EXTENDED' },
        });
      }
    }

    totalCore += coreIds.length;
    totalExtended += extendedIds.length;
    nodeResults.push({ slug: node.slug, core: coreIds.length, extended: extendedIds.length });

    const top3 = assignments.slice(0, 3).map(a => `"${a.movie.title}"`).join(', ');
    console.log(`  ${node.slug.padEnd(46)} CORE=${coreIds.length}  EXTENDED=${extendedIds.length}  top3: ${top3}`);
  }

  console.log('');
  console.log(`Total CORE: ${totalCore}   Total EXTENDED: ${totalExtended}`);
}

main()
  .catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
