/**
 * Find canonical films by title and check their actual season-3 assignments.
 * Also shows misplaced films (canonical film assigned to wrong node).
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Canonical anchors: expected node → film title (partial match ok)
const EXPECTED: { node: string; title: string; yearHint?: number }[] = [
  // proto-sf
  { node: 'proto-science-fiction', title: 'Metropolis', yearHint: 1927 },
  { node: 'proto-science-fiction', title: 'Day the Earth Stood Still', yearHint: 1951 },
  { node: 'proto-science-fiction', title: 'Forbidden Planet' },
  { node: 'proto-science-fiction', title: 'Invasion of the Body Snatchers', yearHint: 1956 },
  { node: 'proto-science-fiction', title: '20,000 Leagues Under the Sea' },
  // space-opera
  { node: 'space-opera', title: 'Star Wars', yearHint: 1977 },
  { node: 'space-opera', title: 'Empire Strikes Back' },
  { node: 'space-opera', title: 'Flash Gordon', yearHint: 1980 },
  // hard-sf
  { node: 'hard-science-fiction', title: '2001: A Space Odyssey' },
  { node: 'hard-science-fiction', title: 'Contact', yearHint: 1997 },
  { node: 'hard-science-fiction', title: 'The Martian' },
  { node: 'hard-science-fiction', title: 'Interstellar' },
  // cyberpunk
  { node: 'cyberpunk', title: 'Blade Runner', yearHint: 1982 },
  { node: 'cyberpunk', title: 'The Matrix', yearHint: 1999 },
  { node: 'cyberpunk', title: 'Ghost in the Shell', yearHint: 1995 },
  { node: 'cyberpunk', title: 'Akira' },
  { node: 'cyberpunk', title: 'Tron', yearHint: 1982 },
  // dystopian
  { node: 'dystopian-science-fiction', title: 'Brazil', yearHint: 1985 },
  { node: 'dystopian-science-fiction', title: 'THX 1138' },
  { node: 'dystopian-science-fiction', title: 'Children of Men' },
  { node: 'dystopian-science-fiction', title: '1984', yearHint: 1984 },
  { node: 'dystopian-science-fiction', title: 'A Clockwork Orange' },
  // post-apoc
  { node: 'post-apocalyptic-science-fiction', title: 'Planet of the Apes', yearHint: 1968 },
  { node: 'post-apocalyptic-science-fiction', title: 'Mad Max', yearHint: 1979 },
  { node: 'post-apocalyptic-science-fiction', title: 'The Road', yearHint: 2009 },
  { node: 'post-apocalyptic-science-fiction', title: 'Mad Max: Fury Road' },
  // time-travel
  { node: 'time-travel-science-fiction', title: 'La Jetée' },
  { node: 'time-travel-science-fiction', title: '12 Monkeys' },
  { node: 'time-travel-science-fiction', title: 'Primer' },
  { node: 'time-travel-science-fiction', title: 'The Terminator' },
  { node: 'time-travel-science-fiction', title: 'Back to the Future' },
  // alt-history
  { node: 'alternate-history-multiverse', title: 'Run Lola Run' },
  { node: 'alternate-history-multiverse', title: 'Everything Everywhere All at Once' },
  { node: 'alternate-history-multiverse', title: 'Sliding Doors' },
  // ai-robotics
  { node: 'artificial-intelligence-robotics', title: 'Ex Machina' },
  { node: 'artificial-intelligence-robotics', title: 'Her', yearHint: 2013 },
  { node: 'artificial-intelligence-robotics', title: 'Blade Runner', yearHint: 1982 },
  { node: 'artificial-intelligence-robotics', title: 'Terminator 2' },
  // alien-contact
  { node: 'alien-contact-invasion', title: 'Close Encounters of the Third Kind' },
  { node: 'alien-contact-invasion', title: 'Arrival', yearHint: 2016 },
  { node: 'alien-contact-invasion', title: 'The Thing', yearHint: 1982 },
  { node: 'alien-contact-invasion', title: 'Invasion of the Body Snatchers', yearHint: 1978 },
  // biopunk
  { node: 'biopunk-genetic-engineering', title: 'The Fly', yearHint: 1986 },
  { node: 'biopunk-genetic-engineering', title: 'Gattaca' },
  { node: 'biopunk-genetic-engineering', title: 'Splice' },
  { node: 'biopunk-genetic-engineering', title: 'Annihilation' },
  // military
  { node: 'military-science-fiction', title: 'Starship Troopers' },
  { node: 'military-science-fiction', title: 'Aliens', yearHint: 1986 },
  { node: 'military-science-fiction', title: 'Full Metal Jacket' },
  { node: 'military-science-fiction', title: 'Edge of Tomorrow' },
  // sf-horror
  { node: 'science-fiction-horror', title: 'Alien', yearHint: 1979 },
  { node: 'science-fiction-horror', title: 'The Thing', yearHint: 1982 },
  { node: 'science-fiction-horror', title: 'Event Horizon' },
  { node: 'science-fiction-horror', title: 'Annihilation' },
  // social-speculative
  { node: 'social-speculative-science-fiction', title: 'They Live' },
  { node: 'social-speculative-science-fiction', title: 'Soylent Green' },
  { node: 'social-speculative-science-fiction', title: 'WALL·E' },
  { node: 'social-speculative-science-fiction', title: 'Children of Men' },
  // new-weird
  { node: 'new-weird-cosmic-science-fiction', title: 'Stalker', yearHint: 1979 },
  { node: 'new-weird-cosmic-science-fiction', title: 'Solaris', yearHint: 1972 },
  { node: 'new-weird-cosmic-science-fiction', title: 'Annihilation' },
  { node: 'new-weird-cosmic-science-fiction', title: 'Under the Skin' },
  // retrofuturism
  { node: 'retrofuturism-steampunk-dieselpunk', title: 'Brazil', yearHint: 1985 },
  { node: 'retrofuturism-steampunk-dieselpunk', title: 'City of Lost Children' },
  { node: 'retrofuturism-steampunk-dieselpunk', title: 'Hugo', yearHint: 2011 },
  { node: 'retrofuturism-steampunk-dieselpunk', title: 'Sky Captain' },
];

type MovieRow = { id: string; tmdbId: number; title: string; year: number | null };
type AssignmentRow = {
  rank: number;
  node: { slug: string };
  movie: MovieRow;
};

async function main() {
  // Get all season-3 assignments indexed by movieId
  const allAssignments = await prisma.nodeMovie.findMany({
    where: { node: { pack: { season: { slug: 'season-3' } } } },
    select: {
      rank: true,
      node: { select: { slug: true } },
      movie: { select: { id: true, tmdbId: true, title: true, year: true } },
    },
  });

  const movieToAssignment = new Map<string, AssignmentRow[]>();
  for (const a of allAssignments) {
    const existing = movieToAssignment.get(a.movie.id) ?? [];
    existing.push(a as AssignmentRow);
    movieToAssignment.set(a.movie.id, existing);
  }

  type Status = 'correct' | 'misplaced' | 'not-assigned' | 'not-in-db';
  type Finding = {
    status: Status;
    expected: string;
    actual: string;
    title: string;
    year: number | null;
    tmdbId: number;
    rank?: number;
  };

  const findings: Finding[] = [];

  for (const exp of EXPECTED) {
    // Search DB by title (case-insensitive, partial)
    const candidates = await prisma.movie.findMany({
      where: { title: { contains: exp.title, mode: 'insensitive' } },
      select: { id: true, tmdbId: true, title: true, year: true },
      take: 5,
    });

    // Pick best match: prefer year hint match, then shortest title
    let movie: MovieRow | null = null;
    if (candidates.length > 0) {
      if (exp.yearHint) {
        movie = candidates.find(c => c.year === exp.yearHint) ?? candidates[0];
      } else {
        // pick shortest title (exact match approximation)
        movie = candidates.sort((a, b) => a.title.length - b.title.length)[0];
      }
    }

    if (!movie) {
      findings.push({ status: 'not-in-db', expected: exp.node, actual: '—', title: exp.title, year: null, tmdbId: 0 });
      continue;
    }

    const assignments = movieToAssignment.get(movie.id) ?? [];
    if (assignments.length === 0) {
      findings.push({ status: 'not-assigned', expected: exp.node, actual: '(no season-3 assignment)', title: movie.title, year: movie.year, tmdbId: movie.tmdbId });
      continue;
    }

    const correctAssignment = assignments.find(a => a.node.slug === exp.node);
    if (correctAssignment) {
      findings.push({ status: 'correct', expected: exp.node, actual: exp.node, title: movie.title, year: movie.year, tmdbId: movie.tmdbId, rank: correctAssignment.rank });
    } else {
      const actualNodes = assignments.map(a => `${a.node.slug} (rank ${a.rank})`).join(', ');
      findings.push({ status: 'misplaced', expected: exp.node, actual: actualNodes, title: movie.title, year: movie.year, tmdbId: movie.tmdbId });
    }
  }

  // Summary
  const correct    = findings.filter(f => f.status === 'correct');
  const misplaced  = findings.filter(f => f.status === 'misplaced');
  const notAssigned = findings.filter(f => f.status === 'not-assigned');
  const notInDb    = findings.filter(f => f.status === 'not-in-db');

  console.log('=== CANON ANCHOR AUDIT ===');
  console.log(`Total checks:    ${findings.length}`);
  console.log(`✅ Correct:      ${correct.length}`);
  console.log(`⚠️  Misplaced:    ${misplaced.length}`);
  console.log(`❌ Not assigned: ${notAssigned.length}`);
  console.log(`❌ Not in DB:    ${notInDb.length}`);
  console.log('');

  if (correct.length > 0) {
    console.log('✅ CORRECT PLACEMENTS:');
    for (const f of correct) {
      console.log(`   ${f.expected.padEnd(46)} rank=${String(f.rank ?? '?').padStart(4)}  "${f.title}" (${f.year})`);
    }
    console.log('');
  }

  if (misplaced.length > 0) {
    console.log('⚠️  MISPLACED (in DB + season-3, wrong node):');
    for (const f of misplaced) {
      console.log(`   Expected: ${f.expected}`);
      console.log(`   Actual:   ${f.actual}`);
      console.log(`   Film:     "${f.title}" (${f.year}) tmdb:${f.tmdbId}`);
      console.log('');
    }
  }

  if (notAssigned.length > 0) {
    console.log('❌ IN DB BUT NOT IN ANY SEASON-3 NODE:');
    for (const f of notAssigned) {
      console.log(`   tmdb:${String(f.tmdbId).padEnd(8)} "${f.title}" (${f.year})  → expected: ${f.expected}`);
    }
    console.log('');
  }

  if (notInDb.length > 0) {
    console.log('❌ NOT IN DB AT ALL:');
    for (const f of notInDb) {
      console.log(`   "${f.title}" → expected: ${f.expected}`);
    }
    console.log('');
  }
}

main()
  .catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
