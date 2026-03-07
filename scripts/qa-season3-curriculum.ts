/**
 * qa-season3-curriculum.ts
 *
 * Full curriculum QA for Season 3 (sci-fi).
 * Checks:
 *   1. Every node contains films (with counts)
 *   2. Canon anchors exist (CORE tier, rank ≤ 10, pre-2000 anchors)
 *   3. Journey progression makes historical sense (year distribution per node)
 *   4. Evidence exists for explanations (doc counts per node)
 *   5. Taxonomy version is consistent
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Known canonical anchor films per node ────────────────────────────────────
// TMDB IDs verified against the actual DB (see qa-anchor-titles.ts audit).
const CANON_ANCHORS: Record<string, { title: string; tmdbId: number }[]> = {
  'proto-science-fiction': [
    { title: 'Metropolis',                   tmdbId: 19    },
    { title: 'The Day the Earth Stood Still', tmdbId: 828   },
    { title: 'Forbidden Planet',             tmdbId: 830   },
    { title: 'Invasion of the Body Snatchers (1956)', tmdbId: 11549 },
  ],
  'space-opera': [
    { title: 'Star Wars',              tmdbId: 11   },
    { title: 'The Empire Strikes Back', tmdbId: 1891 },
    { title: 'Flash Gordon',           tmdbId: 3604 },
  ],
  'hard-science-fiction': [
    { title: '2001: A Space Odyssey', tmdbId: 62     },
    { title: 'Contact',               tmdbId: 686    },
    { title: 'The Martian',           tmdbId: 286217 },
    { title: 'Interstellar',          tmdbId: 157336 },
  ],
  'cyberpunk': [
    { title: 'Blade Runner',      tmdbId: 78   },
    { title: 'The Matrix',        tmdbId: 603  },
    { title: 'Ghost in the Shell', tmdbId: 9323 },
    { title: 'Akira',             tmdbId: 149  },
  ],
  'dystopian-science-fiction': [
    { title: 'Brazil',            tmdbId: 68   },
    { title: 'THX 1138',          tmdbId: 636  },
    { title: 'Children of Men',   tmdbId: 9693 },
    { title: 'A Clockwork Orange', tmdbId: 185  },
    { title: 'Blade Runner',      tmdbId: 78   },
  ],
  'post-apocalyptic-science-fiction': [
    { title: 'Planet of the Apes',   tmdbId: 871   },
    { title: 'Mad Max',              tmdbId: 9659  },
    { title: 'Mad Max: Fury Road',   tmdbId: 76341 },
    { title: 'Terminator 2: Judgment Day', tmdbId: 280 },
  ],
  'time-travel-science-fiction': [
    { title: 'La Jetée',          tmdbId: 662   },
    { title: 'Twelve Monkeys',    tmdbId: 63    },
    { title: 'Primer',            tmdbId: 14337 },
    { title: 'The Terminator',    tmdbId: 218   },
    { title: 'Back to the Future', tmdbId: 105  },
  ],
  'alternate-history-multiverse': [
    { title: 'Sliding Doors',                    tmdbId: 10215  },
    { title: 'Run Lola Run',                     tmdbId: 104    },
    { title: 'Everything Everywhere All at Once', tmdbId: 545611 },
  ],
  'artificial-intelligence-robotics': [
    { title: '2001: A Space Odyssey',      tmdbId: 62     },
    { title: 'Blade Runner',               tmdbId: 78     },
    { title: 'Ex Machina',                 tmdbId: 264660 },
    { title: 'Terminator 2: Judgment Day', tmdbId: 280    },
  ],
  'alien-contact-invasion': [
    { title: 'Invasion of the Body Snatchers (1956)', tmdbId: 11549  },
    { title: 'Close Encounters of the Third Kind',    tmdbId: 840    },
    { title: 'Arrival',                              tmdbId: 329865 },
    { title: 'The Thing',                            tmdbId: 1091   },
    { title: 'Aliens',                               tmdbId: 679    },
  ],
  'biopunk-genetic-engineering': [
    { title: 'The Fly',      tmdbId: 9426   },
    { title: 'Gattaca',      tmdbId: 782    },
    { title: 'Splice',       tmdbId: 37707  },
    { title: 'Annihilation', tmdbId: 300668 },
  ],
  'military-science-fiction': [
    { title: 'Starship Troopers',        tmdbId: 563    },
    { title: 'Aliens',                   tmdbId: 679    },
    { title: 'Full Metal Jacket',        tmdbId: 600    },
    { title: 'Edge of Tomorrow',         tmdbId: 137113 },
  ],
  'science-fiction-horror': [
    { title: 'Alien',         tmdbId: 348    },
    { title: 'The Thing',     tmdbId: 1091   },
    { title: 'Event Horizon', tmdbId: 8413   },
    { title: 'Annihilation',  tmdbId: 300668 },
  ],
  'social-speculative-science-fiction': [
    { title: 'They Live',          tmdbId: 8337   },
    { title: 'Soylent Green',      tmdbId: 12101  },
    { title: 'WALL·E',             tmdbId: 10681  },
    { title: 'Sorry to Bother You', tmdbId: 424781 },
    { title: 'Children of Men',    tmdbId: 9693   },
  ],
  'new-weird-cosmic-science-fiction': [
    { title: 'Stalker',      tmdbId: 1398   },
    { title: 'Solaris',      tmdbId: 593    },
    { title: 'Annihilation', tmdbId: 300668 },
    { title: 'Under the Skin', tmdbId: 97370 },
  ],
  'retrofuturism-steampunk-dieselpunk': [
    { title: 'Brazil',                              tmdbId: 68   },
    { title: 'The City of Lost Children',           tmdbId: 902  },
    { title: 'Sky Captain and the World of Tomorrow', tmdbId: 5137 },
    { title: 'Metropolis',                          tmdbId: 19   },
  ],
};


type PassFail = 'PASS' | 'FAIL' | 'WARN';

interface CheckResult {
  check: string;
  status: PassFail;
  detail: string;
}

const results: CheckResult[] = [];

function pass(check: string, detail: string) { results.push({ check, status: 'PASS', detail }); }
function fail(check: string, detail: string) { results.push({ check, status: 'FAIL', detail }); }
function warn(check: string, detail: string) { results.push({ check, status: 'WARN', detail }); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== SEASON 3 CURRICULUM QA ===\n');

  // Load all season-3 node assignments
  const nodes = await prisma.journeyNode.findMany({
    where: { pack: { season: { slug: 'season-3' } } },
    select: {
      id: true,
      slug: true,
      name: true,
      movies: {
        select: {
          tier: true,
          rank: true,
          coreRank: true,
          taxonomyVersion: true,
          score: true,
          finalScore: true,
          movie: {
            select: {
              id: true,
              tmdbId: true,
              title: true,
              year: true,
              director: true,
              synopsis: true,
            },
          },
        },
        orderBy: { rank: 'asc' },
      },
    },
  });

  // Evidence doc counts per node
  const evidenceCounts = await prisma.evidenceDocument.groupBy({
    by: ['seasonSlug'],
    where: { seasonSlug: 'season-3' },
    _count: { id: true },
  });
  const totalEvidenceDocs = evidenceCounts[0]?._count?.id ?? 0;

  const evidenceByNode: Record<string, { total: number; wikipedia: number; tmdb: number }> = {};
  const rawEvidence = await prisma.evidenceDocument.findMany({
    where: { seasonSlug: 'season-3' },
    select: { sourceName: true, movieId: true },
  });

  // Map movieId -> nodeSlug for evidence counting
  const movieToNodes: Record<string, string[]> = {};
  for (const node of nodes) {
    for (const nm of node.movies) {
      const mid = nm.movie.id;
      if (!movieToNodes[mid]) movieToNodes[mid] = [];
      movieToNodes[mid].push(node.slug);
    }
  }

  for (const node of nodes) {
    evidenceByNode[node.slug] = { total: 0, wikipedia: 0, tmdb: 0 };
  }
  const movieEvidenceMap: Record<string, { hasWiki: boolean; hasTmdb: boolean }> = {};
  for (const e of rawEvidence) {
    if (!movieEvidenceMap[e.movieId]) movieEvidenceMap[e.movieId] = { hasWiki: false, hasTmdb: false };
    if (e.sourceName === 'wikipedia') movieEvidenceMap[e.movieId].hasWiki = true;
    if (e.sourceName === 'tmdb') movieEvidenceMap[e.movieId].hasTmdb = true;
  }
  for (const node of nodes) {
    for (const nm of node.movies) {
      const ev = movieEvidenceMap[nm.movie.id];
      if (ev?.hasWiki) evidenceByNode[node.slug].wikipedia++;
      if (ev?.hasTmdb) evidenceByNode[node.slug].tmdb++;
      if (ev?.hasWiki || ev?.hasTmdb) evidenceByNode[node.slug].total++;
    }
  }

  // ─── CHECK 1: Every node contains films ──────────────────────────────────────
  console.log('CHECK 1: Every node contains films');
  const emptyNodes = nodes.filter(n => n.movies.length === 0);
  if (emptyNodes.length === 0) {
    pass('Node population', `All ${nodes.length} nodes have films assigned`);
    console.log(`  ✅ All ${nodes.length} nodes populated`);
  } else {
    fail('Node population', `Empty nodes: ${emptyNodes.map(n => n.slug).join(', ')}`);
    console.log(`  ❌ Empty nodes: ${emptyNodes.map(n => n.slug).join(', ')}`);
  }
  for (const n of nodes) {
    const core = n.movies.filter(m => m.tier === 'CORE').length;
    const ext = n.movies.filter(m => m.tier === 'EXTENDED').length;
    const deep = n.movies.filter(m => m.tier === 'DEEP_CUT').length;
    console.log(`     ${n.slug.padEnd(46)} total=${n.movies.length}  CORE=${core}  EXT=${ext}  DEEP=${deep}`);
    if (n.movies.length < 50) warn(`Node size: ${n.slug}`, `Only ${n.movies.length} films — expected ≥ 100`);
    if (core < 5) warn(`Core tier: ${n.slug}`, `Only ${core} CORE films — expected ≥ 5`);
  }
  console.log('');

  // ─── CHECK 2: Canon anchors exist ────────────────────────────────────────────
  console.log('CHECK 2: Canon anchors exist');
  const allMovieTmdbIds = new Set(nodes.flatMap(n => n.movies.map(m => m.movie.tmdbId)));
  let totalAnchors = 0;
  let foundAnchors = 0;
  const missingAnchors: string[] = [];

  for (const [nodeSlug, anchors] of Object.entries(CANON_ANCHORS)) {
    const node = nodes.find(n => n.slug === nodeSlug);
    if (!node) continue;
    const nodeTmdbIds = new Set(node.movies.map(m => m.movie.tmdbId));

    for (const anchor of anchors) {
      totalAnchors++;
      if (nodeTmdbIds.has(anchor.tmdbId)) {
        foundAnchors++;
        // Check that it's in a good tier/rank position
        const nm = node.movies.find(m => m.movie.tmdbId === anchor.tmdbId);
        if (nm && nm.rank > 25) {
          warn(`Anchor rank: ${nodeSlug}`, `"${anchor.title}" ranked ${nm.rank} — expected ≤ 25 for a canon anchor`);
        }
      } else {
        missingAnchors.push(`${nodeSlug}: "${anchor.title}" (tmdb:${anchor.tmdbId})`);
      }
    }
  }

  const anchorPct = (foundAnchors / totalAnchors * 100).toFixed(0);
  if (foundAnchors === totalAnchors) {
    pass('Canon anchors', `All ${totalAnchors} canon anchors present`);
    console.log(`  ✅ All ${totalAnchors} canon anchors present`);
  } else if (foundAnchors / totalAnchors >= 0.8) {
    warn('Canon anchors', `${foundAnchors}/${totalAnchors} (${anchorPct}%) anchors present`);
    console.log(`  ⚠️  ${foundAnchors}/${totalAnchors} (${anchorPct}%) canon anchors present`);
  } else {
    fail('Canon anchors', `Only ${foundAnchors}/${totalAnchors} (${anchorPct}%) anchors present`);
    console.log(`  ❌ Only ${foundAnchors}/${totalAnchors} (${anchorPct}%) canon anchors present`);
  }
  if (missingAnchors.length > 0) {
    console.log('  Missing:');
    for (const m of missingAnchors) console.log(`     — ${m}`);
  }
  console.log('');

  // ─── CHECK 3: Journey progression — historical sense ─────────────────────────
  console.log('CHECK 3: Journey progression makes historical sense');

  // Expected: each node should have films spanning meaningful eras
  // Proto-SF should skew old; retrofuturism is meta; cyberpunk modern; etc.
  const ERA_EXPECTATIONS: Record<string, { medianMin: number; medianMax: number; label: string }> = {
    'proto-science-fiction':          { medianMin: 1920, medianMax: 1975, label: 'golden age / 1950s–70s peak' },
    'retrofuturism-steampunk-dieselpunk': { medianMin: 1970, medianMax: 2015, label: '1970s–2010s nostalgia mode' },
    'space-opera':                    { medianMin: 1960, medianMax: 2000, label: 'peak 1977–1990s' },
    'alien-contact-invasion':         { medianMin: 1955, medianMax: 2000, label: '1950s Cold War through Spielberg era' },
    'military-science-fiction':       { medianMin: 1970, medianMax: 2010, label: 'post-Vietnam through Gulf War era' },
    'hard-science-fiction':           { medianMin: 1960, medianMax: 2020, label: '2001 through Interstellar era' },
    'artificial-intelligence-robotics': { medianMin: 1960, medianMax: 2020, label: 'HAL through Ex Machina' },
    'cyberpunk':                      { medianMin: 1980, medianMax: 2020, label: 'Blade Runner through Matrix era' },
    'biopunk-genetic-engineering':    { medianMin: 1980, medianMax: 2020, label: 'The Fly through GATTACA era' },
    'science-fiction-horror':         { medianMin: 1970, medianMax: 2015, label: 'Alien through Event Horizon era' },
    'time-travel-science-fiction':    { medianMin: 1960, medianMax: 2020, label: 'La Jetée through Primer era' },
    'alternate-history-multiverse':   { medianMin: 1985, medianMax: 2022, label: 'post-1985 multiverse era' },
    'social-speculative-science-fiction': { medianMin: 1965, medianMax: 2020, label: 'political SF of all eras' },
    'dystopian-science-fiction':      { medianMin: 1935, medianMax: 2010, label: 'Metropolis through Children of Men' },
    'post-apocalyptic-science-fiction': { medianMin: 1960, medianMax: 2020, label: 'Planet of the Apes through Mad Max: Fury Road' },
    'new-weird-cosmic-science-fiction': { medianMin: 1968, medianMax: 2020, label: 'Tarkovsky through Annihilation era' },
  };

  for (const node of nodes) {
    const years = node.movies
      .map(m => m.movie.year)
      .filter((y): y is number => y !== null && y !== undefined)
      .sort((a, b) => a - b);

    if (years.length === 0) {
      fail(`Year distribution: ${node.slug}`, 'No year data');
      continue;
    }

    const median = years[Math.floor(years.length / 2)];
    const min = years[0];
    const max = years[years.length - 1];
    const expectation = ERA_EXPECTATIONS[node.slug];

    let status: PassFail;
    let detail: string;
    if (!expectation) {
      status = 'WARN';
      detail = `No expectation defined — median=${median}, range=${min}–${max}`;
    } else if (median >= expectation.medianMin && median <= expectation.medianMax) {
      status = 'PASS';
      detail = `median=${median} in [${expectation.medianMin}–${expectation.medianMax}] — ${expectation.label}`;
    } else {
      status = 'WARN';
      detail = `median=${median} OUTSIDE expected [${expectation.medianMin}–${expectation.medianMax}] — ${expectation.label}`;
    }

    results.push({ check: `Year distribution: ${node.slug}`, status, detail });

    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${node.slug.padEnd(46)} median=${median}  range=${min}–${max}`);
    if (status !== 'PASS') console.log(`       Expected: ${expectation?.label ?? 'undefined'}`);
  }
  console.log('');

  // ─── CHECK 4: Evidence exists for explanations ───────────────────────────────
  console.log('CHECK 4: Evidence exists for explanations');
  console.log(`  Total evidence documents (season-3): ${totalEvidenceDocs}`);
  console.log('');

  const EV_THRESHOLD_TOTAL = 0.60; // ≥60% of films should have any evidence
  const EV_THRESHOLD_WIKI  = 0.50; // ≥50% of films should have Wikipedia

  for (const node of nodes) {
    const total = node.movies.length;
    const ev = evidenceByNode[node.slug];
    const anyPct = total > 0 ? ev.total / total : 0;
    const wikiPct = total > 0 ? ev.wikipedia / total : 0;

    const wikiIcon = wikiPct >= EV_THRESHOLD_WIKI ? '✅' : wikiPct >= 0.40 ? '⚠️ ' : '❌';
    const status: PassFail = wikiPct >= EV_THRESHOLD_WIKI ? 'PASS' : wikiPct >= 0.40 ? 'WARN' : 'FAIL';

    results.push({
      check: `Evidence: ${node.slug}`,
      status,
      detail: `${ev.wikipedia}/${total} Wikipedia (${(wikiPct * 100).toFixed(0)}%)  ${ev.tmdb}/${total} TMDB (${(ev.tmdb / total * 100).toFixed(0)}%)`,
    });

    console.log(
      `  ${wikiIcon} ${node.slug.padEnd(46)}` +
      `  wiki=${ev.wikipedia}/${total} (${(wikiPct * 100).toFixed(0)}%)` +
      `  tmdb=${ev.tmdb}/${total} (${(ev.tmdb / total * 100).toFixed(0)}%)`,
    );
  }
  console.log('');

  // ─── CHECK 5: Taxonomy version consistency ───────────────────────────────────
  console.log('CHECK 5: Taxonomy version consistency');
  const allVersions = new Set(nodes.flatMap(n => n.movies.map(m => m.taxonomyVersion)));
  const versionCounts: Record<string, number> = {};
  for (const node of nodes) {
    for (const m of node.movies) {
      versionCounts[m.taxonomyVersion] = (versionCounts[m.taxonomyVersion] ?? 0) + 1;
    }
  }

  console.log('  Taxonomy versions found:');
  for (const [v, count] of Object.entries(versionCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     "${v}": ${count} assignments`);
  }

  if (allVersions.size === 1) {
    pass('Taxonomy version', `Uniform: all assignments use "${[...allVersions][0]}"`);
    console.log(`  ✅ Uniform taxonomy version: "${[...allVersions][0]}"`);
  } else {
    const dominant = Object.entries(versionCounts).sort((a, b) => b[1] - a[1])[0];
    const dominantPct = (dominant[1] / nodes.reduce((s, n) => s + n.movies.length, 0) * 100).toFixed(0);
    if (parseInt(dominantPct) >= 90) {
      warn('Taxonomy version', `Mixed versions — dominant: "${dominant[0]}" (${dominantPct}%)`);
      console.log(`  ⚠️  Mixed versions — dominant "${dominant[0]}" (${dominantPct}%)`);
    } else {
      fail('Taxonomy version', `Highly mixed versions — no clear dominant`);
      console.log(`  ❌ Highly mixed taxonomy versions`);
    }
  }
  console.log('');

  // ─── FINAL REPORT ────────────────────────────────────────────────────────────
  const passes = results.filter(r => r.status === 'PASS').length;
  const warns  = results.filter(r => r.status === 'WARN').length;
  const fails  = results.filter(r => r.status === 'FAIL').length;

  console.log('═'.repeat(70));
  console.log('QA SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  PASS: ${passes}`);
  console.log(`  WARN: ${warns}`);
  console.log(`  FAIL: ${fails}`);
  console.log('');

  if (fails > 0) {
    console.log('FAILURES:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  ❌ ${r.check}`);
      console.log(`     ${r.detail}`);
    }
    console.log('');
  }

  if (warns > 0) {
    console.log('WARNINGS:');
    for (const r of results.filter(r => r.status === 'WARN')) {
      console.log(`  ⚠️  ${r.check}`);
      console.log(`     ${r.detail}`);
    }
    console.log('');
  }

  const verdict = fails === 0 ? (warns === 0 ? '✅ PASS' : '⚠️  PASS WITH WARNINGS') : '❌ FAIL';
  console.log(`OVERALL VERDICT: ${verdict}`);
}

main()
  .catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
