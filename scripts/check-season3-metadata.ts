import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const assignments = await prisma.nodeMovie.findMany({
    where: {
      node: {
        pack: {
          season: { slug: 'season-3' },
        },
      },
    },
    select: {
      tier: true,
      rank: true,
      node: { select: { slug: true } },
      movie: {
        select: {
          id: true,
          tmdbId: true,
          title: true,
          year: true,
          director: true,
          synopsis: true,
          posterUrl: true,
          country: true,
          genres: true,
          evidenceDocuments: {
            where: { seasonSlug: 'season-3', sourceName: 'wikipedia' },
            select: { url: true },
            take: 1,
          },
        },
      },
    },
  });

  // Dedupe by movieId (a movie can appear in multiple nodes)
  const seen = new Map<string, { movie: typeof assignments[0]['movie']; tier: string; nodeSlug: string }>();
  for (const a of assignments) {
    if (!seen.has(a.movie.id)) {
      seen.set(a.movie.id, {
        movie: a.movie,
        tier: a.tier,
        nodeSlug: a.node.slug,
      });
    }
  }

  const movies = [...seen.values()];
  const total = movies.length;

  const missingDirector  = movies.filter(m => !m.movie.director);
  const missingYear      = movies.filter(m => !m.movie.year);
  const missingPoster    = movies.filter(m => !m.movie.posterUrl || m.movie.posterUrl.trim() === '');
  const missingSynopsis  = movies.filter(m => !m.movie.synopsis || m.movie.synopsis.trim().length < 20);
  const missingWiki      = movies.filter(m => m.movie.evidenceDocuments.length === 0);
  const missingGenres    = movies.filter(m => !m.movie.genres);
  const missingCountry   = movies.filter(m => !m.movie.country);

  // Note: runtime does NOT exist in the Movie schema
  // Note: tmdbId is a non-null unique field — always present
  // Note: tier has a DB default (CORE) — always present
  // Note: ontologyNode — all movies have node assignments by query definition

  console.log('=== SEASON 3 METADATA COMPLETENESS ===');
  console.log(`Total unique movies: ${total}`);
  console.log('');
  console.log('NOTE: "runtime" field does NOT exist in the Movie schema.');
  console.log('      tmdbId is non-null unique — 0 missing by definition.');
  console.log('      ontologyNode — 0 missing (filtered to assigned movies).');
  console.log('      tier has a DB default (CORE) — 0 missing by definition.');
  console.log('');
  console.log('FIELD COMPLETENESS:');
  const pad = (s: string) => s.padEnd(14);
  const pct = (n: number) => `${n} (${(n / total * 100).toFixed(1)}% missing)`;
  console.log(`  ${pad('director')}  ${pct(missingDirector.length)}`);
  console.log(`  ${pad('year')}      ${pct(missingYear.length)}`);
  console.log(`  ${pad('synopsis')}  ${pct(missingSynopsis.length)}`);
  console.log(`  ${pad('posterUrl')} ${pct(missingPoster.length)}`);
  console.log(`  ${pad('genres')}    ${pct(missingGenres.length)}`);
  console.log(`  ${pad('country')}   ${pct(missingCountry.length)}`);
  console.log(`  ${pad('wikipedia')} ${pct(missingWiki.length)}`);
  console.log(`  ${'tmdbId'.padEnd(14)}  0 (0.0% missing) — non-null unique`);
  console.log(`  ${'runtime'.padEnd(14)}  N/A — field does not exist in schema`);
  console.log(`  ${'ontologyNode'.padEnd(14)}  0 (0.0% missing) — all assigned`);
  console.log(`  ${'tier'.padEnd(14)}  0 (0.0% missing) — DB default CORE`);
  console.log('');

  // Per-node breakdown
  type NodeStats = {
    total: number;
    missingDirector: number;
    missingYear: number;
    missingSynopsis: number;
    missingWiki: number;
  };
  const byNode: Record<string, NodeStats> = {};
  for (const m of movies) {
    const n = m.nodeSlug;
    if (!byNode[n]) byNode[n] = { total: 0, missingDirector: 0, missingYear: 0, missingSynopsis: 0, missingWiki: 0 };
    byNode[n].total++;
    if (!m.movie.director) byNode[n].missingDirector++;
    if (!m.movie.year) byNode[n].missingYear++;
    if (!m.movie.synopsis || m.movie.synopsis.trim().length < 20) byNode[n].missingSynopsis++;
    if (m.movie.evidenceDocuments.length === 0) byNode[n].missingWiki++;
  }

  const h = 'Node'.padEnd(46) + 'Total'.padStart(7) + 'Dir'.padStart(6) + 'Year'.padStart(6) + 'Syn'.padStart(6) + 'Wiki'.padStart(6);
  console.log('PER-NODE BREAKDOWN (missing counts):');
  console.log(h);
  console.log('-'.repeat(h.length));
  for (const [slug, s] of Object.entries(byNode).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(
      slug.padEnd(46) +
      String(s.total).padStart(7) +
      String(s.missingDirector).padStart(6) +
      String(s.missingYear).padStart(6) +
      String(s.missingSynopsis).padStart(6) +
      String(s.missingWiki).padStart(6),
    );
  }

  if (missingDirector.length > 0) {
    console.log('');
    console.log(`SAMPLE — first 30 missing director (${missingDirector.length} total):`);
    for (const m of missingDirector.slice(0, 30)) {
      console.log(`  tmdb:${String(m.movie.tmdbId).padEnd(8)} ${m.movie.title} (${m.movie.year ?? '?'})`);
    }
  }

  if (missingYear.length > 0 && missingYear.length <= 50) {
    console.log('');
    console.log(`ALL missing year (${missingYear.length}):`);
    for (const m of missingYear) {
      console.log(`  tmdb:${m.movie.tmdbId} | ${m.movie.title}`);
    }
  }
}

main()
  .catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
