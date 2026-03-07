import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CANON_TMDB_IDS = [
  453,2105,2413,8077,   // proto-sf
  11,1891,17467,62,     // space-opera (62 = 2001)
  686,157336,286217,    // hard-sf (Contact, Interstellar, The Martian)
  78,14537,149,603,     // cyberpunk (Blade Runner, GitS, Akira, Matrix)
  68,6557,9693,         // dystopian (Brazil, THX, Children of Men)
  1963,9659,13954,76341,// post-apoc
  8203,63,17473,218,    // time-travel (La Jetée, 12 Monkeys, Primer, Terminator)
  10677,104,545611,     // alt-history (Sliding Doors, Run Lola Run, EEAAO)
  264660,               // ai (Ex Machina)
  840,1091,             // alien (Close Encounters, The Thing)
  2676,782,39240,300668,// biopunk (The Fly, GATTACA, Splice, Annihilation)
  1898,679,600,137113,  // military (Starship Troopers, Aliens, FMJ, Edge of Tomorrow)
  348,8413,             // sf-horror (Alien, Event Horizon)
  8337,4547,10681,490132,//social (They Live, Soylent, WALL-E, Sorry to Bother You)
  1697,1640,172385,     // new-weird (Stalker, Solaris, Under the Skin)
  902,11899,73723,      // retrofuturism (City of Lost Children, Sky Captain, Hugo)
];

async function main() {
  // Which canonical films exist in DB?
  const found = await prisma.movie.findMany({
    where: { tmdbId: { in: CANON_TMDB_IDS } },
    select: { id: true, tmdbId: true, title: true, year: true },
  });
  const foundIds = new Set(found.map(f => f.tmdbId));
  const notInDb = CANON_TMDB_IDS.filter(id => !foundIds.has(id));

  console.log(`Canonical films in DB: ${found.length}/${CANON_TMDB_IDS.length}`);
  if (notInDb.length > 0) console.log(`Not in DB at all: ${notInDb.join(', ')}`);
  console.log('');

  // Which are assigned to season-3 nodes?
  const assignments = await prisma.nodeMovie.findMany({
    where: {
      movie: { tmdbId: { in: [...foundIds] } },
      node: { pack: { season: { slug: 'season-3' } } },
    },
    select: {
      rank: true,
      tier: true,
      node: { select: { slug: true } },
      movie: { select: { tmdbId: true, title: true, year: true } },
    },
    orderBy: [{ node: { slug: 'asc' } }, { rank: 'asc' }],
  });

  const assignedIds = new Set(assignments.map(a => a.movie.tmdbId));
  const inDbNotAssigned = found.filter(f => !assignedIds.has(f.tmdbId));

  console.log(`Canonical films assigned to season-3 nodes: ${assignments.length}`);
  if (inDbNotAssigned.length > 0) {
    console.log(`In DB but NOT assigned to any season-3 node:`);
    for (const f of inDbNotAssigned) console.log(`  tmdb:${f.tmdbId} | ${f.title} (${f.year})`);
  }
  console.log('');
  console.log('Node assignments:');
  for (const a of assignments) {
    console.log(`  ${a.node.slug.padEnd(46)} rank=${String(a.rank).padStart(4)}  ${a.movie.title} (${a.movie.year})`);
  }

  // Proto-SF top 20
  console.log('\n=== TOP 20: proto-science-fiction ===');
  const proto = await prisma.nodeMovie.findMany({
    where: { node: { slug: 'proto-science-fiction', pack: { season: { slug: 'season-3' } } } },
    select: { rank: true, movie: { select: { title: true, year: true, tmdbId: true } } },
    orderBy: { rank: 'asc' },
    take: 20,
  });
  for (const m of proto) {
    console.log(`  rank=${String(m.rank).padStart(3)} | ${m.movie.title} (${m.movie.year}) tmdb:${m.movie.tmdbId}`);
  }

  // Cyberpunk top 10
  console.log('\n=== TOP 10: cyberpunk ===');
  const cyber = await prisma.nodeMovie.findMany({
    where: { node: { slug: 'cyberpunk', pack: { season: { slug: 'season-3' } } } },
    select: { rank: true, movie: { select: { title: true, year: true, tmdbId: true } } },
    orderBy: { rank: 'asc' },
    take: 10,
  });
  for (const m of cyber) {
    console.log(`  rank=${String(m.rank).padStart(3)} | ${m.movie.title} (${m.movie.year}) tmdb:${m.movie.tmdbId}`);
  }

  // Science-fiction-horror top 10
  console.log('\n=== TOP 10: science-fiction-horror ===');
  const sfh = await prisma.nodeMovie.findMany({
    where: { node: { slug: 'science-fiction-horror', pack: { season: { slug: 'season-3' } } } },
    select: { rank: true, movie: { select: { title: true, year: true, tmdbId: true } } },
    orderBy: { rank: 'asc' },
    take: 10,
  });
  for (const m of sfh) {
    console.log(`  rank=${String(m.rank).padStart(3)} | ${m.movie.title} (${m.movie.year}) tmdb:${m.movie.tmdbId}`);
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
