/**
 * fix-season3-canon-assignments.ts
 *
 * Remediates the season-3 curriculum by:
 *   1. Adding canonical films to their correct nodes (in DB, not yet assigned to s3)
 *   2. Adding canonical films currently in wrong nodes to their correct nodes
 *   3. Setting each canonical to rank 1–N so it surfaces at the top of its node
 *
 * Uses upsert so it is safe to re-run.
 * Does NOT delete wrong-node assignments (films may legitimately appear in multiple nodes).
 *
 * Usage:
 *   npx tsx scripts/fix-season3-canon-assignments.ts --dry-run
 *   npx tsx scripts/fix-season3-canon-assignments.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Canonical films that must be present (and ranked highly) in specific nodes.
 * tmdbId is the authoritative identifier sourced from the QA audit above.
 * rank: target rank within the node (1 = top).
 */
const CANONICAL_ASSIGNMENTS: {
  tmdbId: number;
  title: string;
  node: string;
  rank: number;
}[] = [
  // ── proto-science-fiction ───────────────────────────────────────────────────
  { tmdbId: 19,    title: 'Metropolis (1927)',                     node: 'proto-science-fiction',               rank: 1 },
  { tmdbId: 828,   title: 'The Day the Earth Stood Still (1951)',  node: 'proto-science-fiction',               rank: 2 },
  { tmdbId: 830,   title: 'Forbidden Planet (1956)',               node: 'proto-science-fiction',               rank: 3 },
  { tmdbId: 11549, title: 'Invasion of the Body Snatchers (1956)', node: 'proto-science-fiction',               rank: 4 },

  // ── space-opera ─────────────────────────────────────────────────────────────
  { tmdbId: 11,    title: 'Star Wars (1977)',                      node: 'space-opera',                         rank: 1 },
  { tmdbId: 1891,  title: 'The Empire Strikes Back (1980)',        node: 'space-opera',                         rank: 2 },
  { tmdbId: 3604,  title: 'Flash Gordon (1980)',                   node: 'space-opera',                         rank: 8 },
  { tmdbId: 830,   title: 'Forbidden Planet (1956)',               node: 'space-opera',                         rank: 10 },

  // ── hard-science-fiction ────────────────────────────────────────────────────
  { tmdbId: 62,    title: '2001: A Space Odyssey (1968)',          node: 'hard-science-fiction',                rank: 1 },
  { tmdbId: 686,   title: 'Contact (1997)',                        node: 'hard-science-fiction',                rank: 2 },
  { tmdbId: 157336,title: 'Interstellar (2014)',                   node: 'hard-science-fiction',                rank: 3 },
  { tmdbId: 286217,title: 'The Martian (2015)',                    node: 'hard-science-fiction',                rank: 4 },
  { tmdbId: 662,   title: 'La Jetée (1962)',                       node: 'hard-science-fiction',                rank: 5 },

  // ── cyberpunk ───────────────────────────────────────────────────────────────
  { tmdbId: 78,    title: 'Blade Runner (1982)',                   node: 'cyberpunk',                           rank: 1 },
  { tmdbId: 603,   title: 'The Matrix (1999)',                     node: 'cyberpunk',                           rank: 2 },
  { tmdbId: 9323,  title: 'Ghost in the Shell (1995)',             node: 'cyberpunk',                           rank: 3 },
  { tmdbId: 149,   title: 'Akira (1988)',                          node: 'cyberpunk',                           rank: 4 },
  { tmdbId: 218,   title: 'The Terminator (1984)',                 node: 'cyberpunk',                           rank: 10 },

  // ── dystopian-science-fiction ───────────────────────────────────────────────
  { tmdbId: 68,    title: 'Brazil (1985)',                         node: 'dystopian-science-fiction',           rank: 1 },
  { tmdbId: 636,   title: 'THX 1138 (1971)',                        node: 'dystopian-science-fiction',           rank: 2 },
  { tmdbId: 9693,  title: 'Children of Men (2006)',                node: 'dystopian-science-fiction',           rank: 3 },
  { tmdbId: 185,   title: 'A Clockwork Orange (1971)',             node: 'dystopian-science-fiction',           rank: 4 },
  { tmdbId: 78,    title: 'Blade Runner (1982)',                   node: 'dystopian-science-fiction',           rank: 5 },

  // ── post-apocalyptic-science-fiction ────────────────────────────────────────
  { tmdbId: 871,   title: 'Planet of the Apes (1968)',             node: 'post-apocalyptic-science-fiction',    rank: 1 },
  { tmdbId: 9659,  title: 'Mad Max (1979)',                        node: 'post-apocalyptic-science-fiction',    rank: 2 },
  { tmdbId: 76341, title: 'Mad Max: Fury Road (2015)',             node: 'post-apocalyptic-science-fiction',    rank: 3 },
  { tmdbId: 280,   title: 'Terminator 2: Judgment Day (1991)',     node: 'post-apocalyptic-science-fiction',    rank: 10 },

  // ── time-travel-science-fiction ─────────────────────────────────────────────
  { tmdbId: 662,   title: 'La Jetée (1962)',                       node: 'time-travel-science-fiction',         rank: 1 },
  { tmdbId: 63,    title: 'Twelve Monkeys (1995)',                 node: 'time-travel-science-fiction',         rank: 2 },
  { tmdbId: 14337, title: 'Primer (2004)',                         node: 'time-travel-science-fiction',         rank: 3 },
  { tmdbId: 218,   title: 'The Terminator (1984)',                 node: 'time-travel-science-fiction',         rank: 4 },
  { tmdbId: 105,   title: 'Back to the Future (1985)',             node: 'time-travel-science-fiction',         rank: 5 },

  // ── alternate-history-multiverse ────────────────────────────────────────────
  { tmdbId: 545611,title: 'Everything Everywhere All at Once',     node: 'alternate-history-multiverse',        rank: 1 },
  { tmdbId: 104,   title: 'Run Lola Run (1999)',                   node: 'alternate-history-multiverse',        rank: 2 },
  { tmdbId: 10215, title: 'Sliding Doors (1998)',                  node: 'alternate-history-multiverse',        rank: 3 },

  // ── artificial-intelligence-robotics ────────────────────────────────────────
  { tmdbId: 62,    title: '2001: A Space Odyssey (1968)',          node: 'artificial-intelligence-robotics',    rank: 1 },
  { tmdbId: 78,    title: 'Blade Runner (1982)',                   node: 'artificial-intelligence-robotics',    rank: 2 },
  { tmdbId: 264660,title: 'Ex Machina (2015)',                     node: 'artificial-intelligence-robotics',    rank: 3 },
  { tmdbId: 280,   title: 'Terminator 2: Judgment Day (1991)',     node: 'artificial-intelligence-robotics',    rank: 4 },

  // ── alien-contact-invasion ──────────────────────────────────────────────────
  { tmdbId: 11549, title: 'Invasion of the Body Snatchers (1956)', node: 'alien-contact-invasion',              rank: 1 },
  { tmdbId: 840,   title: 'Close Encounters of the Third Kind',    node: 'alien-contact-invasion',              rank: 2 },
  { tmdbId: 329865,title: 'Arrival (2016)',                        node: 'alien-contact-invasion',              rank: 3 },
  { tmdbId: 1091,  title: 'The Thing (1982)',                      node: 'alien-contact-invasion',              rank: 4 },
  { tmdbId: 679,   title: 'Aliens (1986)',                         node: 'alien-contact-invasion',              rank: 5 },

  // ── biopunk-genetic-engineering ─────────────────────────────────────────────
  { tmdbId: 9426,  title: 'The Fly (1986)',                        node: 'biopunk-genetic-engineering',         rank: 1 },
  { tmdbId: 782,   title: 'Gattaca (1997)',                        node: 'biopunk-genetic-engineering',         rank: 2 },
  { tmdbId: 37707, title: 'Splice (2010)',                         node: 'biopunk-genetic-engineering',         rank: 3 },
  { tmdbId: 300668,title: 'Annihilation (2018)',                   node: 'biopunk-genetic-engineering',         rank: 4 },

  // ── military-science-fiction ────────────────────────────────────────────────
  { tmdbId: 563,   title: 'Starship Troopers (1997)',              node: 'military-science-fiction',            rank: 1 },
  { tmdbId: 679,   title: 'Aliens (1986)',                         node: 'military-science-fiction',            rank: 2 },
  { tmdbId: 600,   title: 'Full Metal Jacket (1987)',              node: 'military-science-fiction',            rank: 3 },
  { tmdbId: 137113,title: 'Edge of Tomorrow (2014)',               node: 'military-science-fiction',            rank: 4 },

  // ── science-fiction-horror ──────────────────────────────────────────────────
  { tmdbId: 348,   title: 'Alien (1979)',                          node: 'science-fiction-horror',              rank: 1 },
  { tmdbId: 1091,  title: 'The Thing (1982)',                      node: 'science-fiction-horror',              rank: 2 },
  { tmdbId: 8413,  title: 'Event Horizon (1997)',                  node: 'science-fiction-horror',              rank: 3 },
  { tmdbId: 300668,title: 'Annihilation (2018)',                   node: 'science-fiction-horror',              rank: 4 },

  // ── social-speculative-science-fiction ──────────────────────────────────────
  { tmdbId: 8337,  title: 'They Live (1988)',                      node: 'social-speculative-science-fiction',  rank: 1 },
  { tmdbId: 12101, title: 'Soylent Green (1973)',                  node: 'social-speculative-science-fiction',  rank: 2 },
  { tmdbId: 10681, title: 'WALL·E (2008)',                         node: 'social-speculative-science-fiction',  rank: 3 },
  { tmdbId: 424781,title: 'Sorry to Bother You (2018)',            node: 'social-speculative-science-fiction',  rank: 6 },
  { tmdbId: 782,   title: 'Gattaca (1997)',                        node: 'social-speculative-science-fiction',  rank: 4 },
  { tmdbId: 9693,  title: 'Children of Men (2006)',                node: 'social-speculative-science-fiction',  rank: 5 },

  // ── new-weird-cosmic-science-fiction ────────────────────────────────────────
  { tmdbId: 1398,  title: 'Stalker (1979)',                        node: 'new-weird-cosmic-science-fiction',    rank: 1 },
  { tmdbId: 593,   title: 'Solaris (1972)',                        node: 'new-weird-cosmic-science-fiction',    rank: 2 },
  { tmdbId: 300668,title: 'Annihilation (2018)',                   node: 'new-weird-cosmic-science-fiction',    rank: 3 },
  { tmdbId: 97370, title: 'Under the Skin (2014)',                 node: 'new-weird-cosmic-science-fiction',    rank: 4 },

  // ── retrofuturism-steampunk-dieselpunk ──────────────────────────────────────
  { tmdbId: 68,    title: 'Brazil (1985)',                         node: 'retrofuturism-steampunk-dieselpunk',  rank: 1 },
  { tmdbId: 902,   title: 'The City of Lost Children (1995)',      node: 'retrofuturism-steampunk-dieselpunk',  rank: 2 },
  { tmdbId: 5137,  title: 'Sky Captain and the World of Tomorrow', node: 'retrofuturism-steampunk-dieselpunk',  rank: 3 },
  { tmdbId: 19,    title: 'Metropolis (1927)',                     node: 'retrofuturism-steampunk-dieselpunk',  rank: 4 },
];

async function main() {
  if (DRY_RUN) console.log('-- DRY RUN — no DB writes --\n');

  // Build node slug → id map
  const nodes = await prisma.journeyNode.findMany({
    where: { pack: { season: { slug: 'season-3' } } },
    select: { id: true, slug: true },
  });
  const nodeMap = new Map(nodes.map(n => [n.slug, n.id]));

  // Build tmdbId → movie id map
  const tmdbIds = [...new Set(CANONICAL_ASSIGNMENTS.map(a => a.tmdbId))];
  const movies = await prisma.movie.findMany({
    where: { tmdbId: { in: tmdbIds } },
    select: { id: true, tmdbId: true, title: true, year: true },
  });
  const movieMap = new Map(movies.map(m => [m.tmdbId, m]));

  let upserted = 0;
  let skippedNotInDb = 0;
  let skippedNodeNotFound = 0;

  for (const canon of CANONICAL_ASSIGNMENTS) {
    const movie = movieMap.get(canon.tmdbId);
    if (!movie) {
      console.log(`  ⚠️  NOT IN DB: tmdb:${canon.tmdbId} "${canon.title}" — skipping`);
      skippedNotInDb++;
      continue;
    }

    const nodeId = nodeMap.get(canon.node);
    if (!nodeId) {
      console.log(`  ⚠️  NODE NOT FOUND: "${canon.node}" — skipping`);
      skippedNodeNotFound++;
      continue;
    }

    const label = `tmdb:${canon.tmdbId} "${movie.title}" (${movie.year}) → ${canon.node} rank=${canon.rank}`;

    if (DRY_RUN) {
      console.log(`  [dry-run] ${label}`);
      upserted++;
      continue;
    }

    await prisma.nodeMovie.upsert({
      where: { nodeId_movieId: { nodeId, movieId: movie.id } },
      create: {
        nodeId,
        movieId: movie.id,
        rank: canon.rank,
        tier: 'CORE',
        source: 'curriculum-qa-fix',
        taxonomyVersion: 'season-3-sci-fi-v1',
        finalScore: 0,
        journeyScore: 0,
      },
      update: {
        rank: canon.rank,
        tier: 'CORE',
        source: 'curriculum-qa-fix',
      },
    });

    console.log(`  ✅ ${label}`);
    upserted++;
  }

  console.log('');
  console.log(`Done. Upserted: ${upserted}, Not in DB: ${skippedNotInDb}, Node not found: ${skippedNodeNotFound}`);

  if (skippedNotInDb > 0 && !DRY_RUN) {
    console.log('');
    console.log('Films NOT in DB (need TMDB fetch to add):');
    for (const canon of CANONICAL_ASSIGNMENTS) {
      if (!movieMap.has(canon.tmdbId)) {
        console.log(`  tmdb:${canon.tmdbId} "${canon.title}"`);
      }
    }
  }
}

main()
  .catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
