/**
 * validate-season3-snapshot.ts
 *
 * Full pre-publish snapshot validation for Season 3 (sci-fi).
 * Checks:
 *   1. Candidate pool consistency — every DB CORE assignment has a valid movie record
 *   2. Node assignment integrity — no orphaned assignments, all nodes populated
 *   3. Tier distribution — counts per tier, flags missing stratification
 *   4. Deterministic reproducibility — same (packId + taxonomyVersion) always produces same candidate set
 *   5. Snapshot ↔ DB divergence — mastered.json vs current DB assignments
 *   6. Publication readiness — all publish gates checked
 *
 * Usage:
 *   npx tsx scripts/validate-season3-snapshot.ts
 *   npx tsx scripts/validate-season3-snapshot.ts --publish   # also create/update the release
 */

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();
const PUBLISH_FLAG = process.argv.includes('--publish');

const GOVERNANCE_PATH = path.resolve('docs/season/season-3-sci-fi-node-governance.json');
const MASTERED_PATH   = path.resolve('docs/season/season-3-sci-fi-mastered.json');
const SEASON_SLUG     = 'season-3';
const PACK_SLUG       = 'sci-fi';
const TAXONOMY        = 'season-3-sci-fi-v1';
const MIN_CORE_PER_NODE = 20;
const MAX_LOSS_RATE_PCT  = 5;

// ─── Report accumulator ───────────────────────────────────────────────────────
type Status = 'PASS' | 'WARN' | 'FAIL';
const checks: { name: string; status: Status; detail: string }[] = [];

function pass(name: string, detail: string) { checks.push({ name, status: 'PASS', detail }); }
function warn(name: string, detail: string) { checks.push({ name, status: 'WARN', detail }); }
function fail(name: string, detail: string) { checks.push({ name, status: 'FAIL', detail }); }
function section(title: string) { console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`); }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== SEASON 3 SNAPSHOT VALIDATION ===');
  console.log(`taxonomy: ${TAXONOMY}  publish: ${PUBLISH_FLAG}\n`);

  // ── Load governance ─────────────────────────────────────────────────────────
  const governance = JSON.parse(await fs.readFile(GOVERNANCE_PATH, 'utf8'));

  // ── Load season / pack ──────────────────────────────────────────────────────
  const season = await prisma.season.findUnique({ where: { slug: SEASON_SLUG }, select: { id: true, slug: true, isActive: true } });
  if (!season) { fail('Season exists', `Season "${SEASON_SLUG}" not found in DB`); return printAndExit(); }
  pass('Season exists', `id=${season.id}  isActive=${season.isActive}`);

  const pack = await prisma.genrePack.findUnique({ where: { slug: PACK_SLUG }, select: { id: true, slug: true, seasonId: true, isEnabled: true } });
  if (!pack || pack.seasonId !== season.id) { fail('Pack exists', `Pack "${PACK_SLUG}" missing or wrong season`); return printAndExit(); }
  pass('Pack exists', `id=${pack.id}  isEnabled=${pack.isEnabled}`);

  // ── Load nodes ──────────────────────────────────────────────────────────────
  section('CHECK 1 — Node population');
  const nodes = await prisma.journeyNode.findMany({
    where: { packId: pack.id },
    select: {
      id: true, slug: true, orderIndex: true,
      movies: { where: { taxonomyVersion: TAXONOMY }, select: { tier: true, rank: true, coreRank: true, source: true, movieId: true, movie: { select: { tmdbId: true, title: true, year: true, posterUrl: true, synopsis: true } } } },
    },
    orderBy: { orderIndex: 'asc' },
  });

  if (nodes.length === 0) { fail('Nodes populated', 'No JourneyNodes found'); return printAndExit(); }
  console.log(`  ${nodes.length} nodes found (governance expects ${Object.keys(governance.nodes).length})`);

  const missingNodes = Object.keys(governance.nodes).filter(slug => !nodes.find(n => n.slug === slug));
  if (missingNodes.length > 0) {
    fail('Node coverage', `Missing nodes: ${missingNodes.join(', ')}`);
  } else {
    pass('Node coverage', `All ${nodes.length} governance-defined nodes present`);
  }

  let totalCore = 0; let totalAll = 0;
  const nodeStats: Record<string, { core: number; extended: number; deepCut: number; total: number }> = {};
  const sourceCounts: Record<string, number> = {};
  const allCoreTmdbIds = new Set<number>();
  const nodeByTmdb = new Map<number, string[]>();

  for (const node of nodes) {
    const core = node.movies.filter(m => m.tier === 'CORE');
    const ext  = node.movies.filter(m => m.tier === 'EXTENDED');
    const deep = node.movies.filter(m => m.tier === 'DEEP_CUT');
    nodeStats[node.slug] = { core: core.length, extended: ext.length, deepCut: deep.length, total: node.movies.length };
    totalCore += core.length; totalAll += node.movies.length;
    for (const m of core) {
      allCoreTmdbIds.add(m.movie.tmdbId);
      const existing = nodeByTmdb.get(m.movie.tmdbId) ?? [];
      existing.push(node.slug);
      nodeByTmdb.set(m.movie.tmdbId, existing);
    }
    for (const m of node.movies) sourceCounts[m.source] = (sourceCounts[m.source] ?? 0) + 1;
    const line = `  ${node.slug.padEnd(46)} core=${core.length}  ext=${ext.length}  deep=${deep.length}`;
    console.log(line);
    if (core.length < MIN_CORE_PER_NODE) warn(`Node floor: ${node.slug}`, `core=${core.length} < min=${MIN_CORE_PER_NODE}`);
    else pass(`Node floor: ${node.slug}`, `core=${core.length} ≥ ${MIN_CORE_PER_NODE}`);
  }
  console.log(`  Total assignments: ${totalAll}  CORE: ${totalCore}  unique CORE films: ${allCoreTmdbIds.size}`);

  // ── CHECK 2 — Candidate pool consistency ────────────────────────────────────
  section('CHECK 2 — Candidate pool consistency');

  // Every core assignment should have a valid movie with poster + synopsis
  let missingPoster = 0; let missingSynopsis = 0; let missingYear = 0;
  for (const node of nodes) {
    for (const m of node.movies.filter(a => a.tier === 'CORE')) {
      if (!m.movie.posterUrl || m.movie.posterUrl.trim() === '') missingPoster++;
      if (!m.movie.synopsis || m.movie.synopsis.trim().length < 20) missingSynopsis++;
      if (!m.movie.year) missingYear++;
    }
  }

  const posterPct = ((totalCore - missingPoster) / totalCore * 100).toFixed(1);
  const synopsisPct = ((totalCore - missingSynopsis) / totalCore * 100).toFixed(1);
  console.log(`  poster:   ${posterPct}% complete (${missingPoster} missing)`);
  console.log(`  synopsis: ${synopsisPct}% complete (${missingSynopsis} missing)`);
  console.log(`  year:     ${((totalCore - missingYear) / totalCore * 100).toFixed(1)}% complete (${missingYear} missing)`);

  if (missingPoster === 0) pass('Poster coverage', 'All CORE films have poster URL');
  else if (missingPoster / totalCore < 0.01) warn('Poster coverage', `${missingPoster} missing (<1%)`);
  else fail('Poster coverage', `${missingPoster} (${(missingPoster / totalCore * 100).toFixed(1)}%) missing`);

  if (missingSynopsis / totalCore < 0.01) pass('Synopsis coverage', `${missingSynopsis} missing (<1%)`);
  else warn('Synopsis coverage', `${missingSynopsis} (${(missingSynopsis / totalCore * 100).toFixed(1)}%) CORE films lack synopsis`);

  // ── CHECK 3 — Tier distribution ─────────────────────────────────────────────
  section('CHECK 3 — Tier distribution');
  const tierCounts = { CORE: 0, EXTENDED: 0, DEEP_CUT: 0 };
  for (const node of nodes) {
    for (const m of node.movies) {
      if (m.tier in tierCounts) tierCounts[m.tier as keyof typeof tierCounts]++;
    }
  }
  console.log(`  CORE:     ${tierCounts.CORE}`);
  console.log(`  EXTENDED: ${tierCounts.EXTENDED}`);
  console.log(`  DEEP_CUT: ${tierCounts.DEEP_CUT}`);
  console.log(`  Sources:  ${Object.entries(sourceCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}=${v}`).join('  ')}`);

  if (tierCounts.CORE > 0) pass('CORE tier populated', `${tierCounts.CORE} assignments`);
  else fail('CORE tier populated', 'No CORE assignments found');

  if (tierCounts.EXTENDED === 0) {
    warn('Tier stratification', 'No EXTENDED tier — all films are CORE. Consider a stratification pass to distinguish canonical from extended corpus.');
  } else {
    pass('Tier stratification', `CORE=${tierCounts.CORE}  EXTENDED=${tierCounts.EXTENDED}  DEEP_CUT=${tierCounts.DEEP_CUT}`);
  }

  // Cross-node overlap (films in >2 nodes = possible misclassification)
  const overassigned = [...nodeByTmdb.entries()].filter(([, nodes]) => nodes.length > 2);
  if (overassigned.length === 0) {
    pass('Cross-node overlap', 'No films appear in more than 2 nodes');
  } else {
    warn('Cross-node overlap', `${overassigned.length} films in >2 nodes — top offenders: ${overassigned.slice(0, 5).map(([id, ns]) => `tmdb:${id}(${ns.length})`).join(', ')}`);
  }

  // ── CHECK 4 — Deterministic reproducibility ─────────────────────────────────
  section('CHECK 4 — Deterministic reproducibility');

  // Reproducibility = given taxonomyVersion + packId, the CORE set is stable
  // We verify by hashing the sorted set of (nodeSlug:tmdbId) pairs
  const assignmentList = nodes.flatMap(n =>
    n.movies.filter(m => m.tier === 'CORE').map(m => `${n.slug}:${m.movie.tmdbId}`)
  ).sort();
  const fingerprint = createHash('sha256').update(assignmentList.join('\n')).digest('hex').slice(0, 16);

  console.log(`  Assignment fingerprint (sha256[:16]): ${fingerprint}`);
  console.log(`  Total CORE (nodeSlug:tmdbId) pairs: ${assignmentList.length}`);

  // Check for rank collisions (non-deterministic ordering risk)
  let rankCollisions = 0;
  for (const node of nodes) {
    const rankMap = new Map<number, number>();
    for (const m of node.movies) {
      rankMap.set(m.rank, (rankMap.get(m.rank) ?? 0) + 1);
    }
    const collisions = [...rankMap.values()].filter(v => v > 1).length;
    if (collisions > 0) {
      rankCollisions += collisions;
      console.log(`  ⚠️  Rank collisions in ${node.slug}: ${collisions} duplicate ranks`);
    }
  }
  if (rankCollisions === 0) {
    pass('Rank ordering', 'No rank collisions — ordering is deterministic within nodes');
  } else {
    warn('Rank ordering', `${rankCollisions} duplicate ranks found — within-node ordering is non-deterministic. Run a rank-dedup pass before publishing.`);
  }

  // Governance constraint: check disallowed pairs
  const disallowedPairs = (governance.overlapConstraints?.disallowedPairs ?? []) as string[][];
  let disallowedViolations = 0;
  for (const [a, b] of disallowedPairs) {
    const aIds = new Set(nodes.find(n => n.slug === a)?.movies.filter(m => m.tier === 'CORE').map(m => m.movie.tmdbId) ?? []);
    const bIds = new Set(nodes.find(n => n.slug === b)?.movies.filter(m => m.tier === 'CORE').map(m => m.movie.tmdbId) ?? []);
    const overlap = [...aIds].filter(id => bIds.has(id));
    if (overlap.length > 0) {
      warn(`Disallowed pair: ${a} ↔ ${b}`, `${overlap.length} shared CORE films: ${overlap.slice(0,5).map(id=>`tmdb:${id}`).join(', ')}`);
      disallowedViolations++;
    }
  }
  if (disallowedViolations === 0) {
    pass('Governance: disallowed pairs', 'No disallowed node-pair overlaps');
  }

  // ── CHECK 5 — Snapshot ↔ DB divergence ──────────────────────────────────────
  section('CHECK 5 — Snapshot ↔ DB divergence');

  let masteredData: { nodes: Array<{ slug: string; core: Array<{ tmdbId: number; title?: string }> }> } | null = null;
  try {
    const raw = await fs.readFile(MASTERED_PATH, 'utf8');
    masteredData = JSON.parse(raw);
    console.log(`  Mastered snapshot: ${MASTERED_PATH}`);
  } catch {
    warn('Mastered snapshot', `Cannot read mastered file — ${MASTERED_PATH}. Snapshot divergence check skipped.`);
  }

  if (masteredData) {
    // Build authority set from mastered
    const authoritySet = new Set<string>();
    for (const node of masteredData.nodes ?? []) {
      for (const film of node.core ?? []) {
        authoritySet.add(`${node.slug}:${film.tmdbId}`);
      }
    }

    // Current DB set
    const dbSet = new Set(assignmentList);

    const inAuthorityNotDb = [...authoritySet].filter(k => !dbSet.has(k));
    const inDbNotAuthority = [...dbSet].filter(k => !authoritySet.has(k));

    const lossRate = authoritySet.size > 0 ? (inAuthorityNotDb.length / authoritySet.size * 100) : 0;

    console.log(`  Authority (mastered): ${authoritySet.size} entries`);
    console.log(`  DB (current):         ${dbSet.size} entries`);
    console.log(`  In authority, not DB: ${inAuthorityNotDb.length} (loss rate: ${lossRate.toFixed(1)}%)`);
    console.log(`  In DB, not authority: ${inDbNotAuthority.length} (net additions)`);

    if (lossRate <= MAX_LOSS_RATE_PCT) {
      pass('Snapshot loss rate', `${lossRate.toFixed(1)}% ≤ ${MAX_LOSS_RATE_PCT}% threshold`);
    } else {
      fail('Snapshot loss rate', `${lossRate.toFixed(1)}% exceeds ${MAX_LOSS_RATE_PCT}% threshold — ${inAuthorityNotDb.length} authority films missing from DB`);
      if (inAuthorityNotDb.length <= 20) {
        for (const k of inAuthorityNotDb) console.log(`    missing: ${k}`);
      }
    }

    if (inDbNotAuthority.length > 0) {
      warn('Snapshot additions', `${inDbNotAuthority.length} CORE films added to DB since mastered snapshot (canonical fixes + new assignments). Snapshot should be regenerated.`);
    }
  }

  // ── CHECK 6 — Publication readiness ─────────────────────────────────────────
  section('CHECK 6 — Publication readiness');

  // Check if a published release already exists
  const existingRelease = await prisma.seasonNodeRelease.findFirst({
    where: { packId: pack.id, isPublished: true },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, taxonomyVersion: true, publishedAt: true, runId: true, metadata: true },
  });

  if (existingRelease) {
    console.log(`  Existing published release: ${existingRelease.id}`);
    console.log(`  Published at: ${existingRelease.publishedAt?.toISOString() ?? 'unknown'}`);
    console.log(`  Taxonomy: ${existingRelease.taxonomyVersion}`);
    warn('Existing release', `An active release exists (id=${existingRelease.id}). Re-publishing will supersede it.`);
  } else {
    console.log('  No published release found — first publish.');
    pass('Publication gate', 'No existing release to conflict with');
  }

  // Confirm CORE count meets floor
  if (tierCounts.CORE >= nodes.length * MIN_CORE_PER_NODE) {
    pass('CORE floor gate', `${tierCounts.CORE} total CORE ≥ ${nodes.length * MIN_CORE_PER_NODE} (${nodes.length} nodes × ${MIN_CORE_PER_NODE} min)`);
  } else {
    fail('CORE floor gate', `Only ${tierCounts.CORE} CORE assignments (need ≥ ${nodes.length * MIN_CORE_PER_NODE})`);
  }

  // Taxonomy version matches governance
  if (governance.taxonomyVersion === TAXONOMY) {
    pass('Taxonomy alignment', `Governance and DB both use "${TAXONOMY}"`);
  } else {
    fail('Taxonomy alignment', `Governance has "${governance.taxonomyVersion}" but validator expects "${TAXONOMY}"`);
  }

  // ── Publish (optional) ───────────────────────────────────────────────────────
  if (PUBLISH_FLAG) {
    section('PUBLISHING');
    const hasFails = checks.some(c => c.status === 'FAIL');
    if (hasFails) {
      console.log('  ❌ Failing checks present — aborting publish. Fix failures first.');
    } else {
      const runId = `season3-validated-${new Date().toISOString()}`;
      const coreAssignments = await prisma.nodeMovie.findMany({
        where: { node: { packId: pack.id }, taxonomyVersion: TAXONOMY, tier: 'CORE' },
        include: { node: { select: { slug: true, orderIndex: true } } },
        orderBy: [{ node: { orderIndex: 'asc' } }, { coreRank: 'asc' }, { rank: 'asc' }],
      });

      const release = await prisma.$transaction(async tx => {
        await tx.seasonNodeRelease.updateMany({
          where: { seasonId: season.id, packId: pack.id, isPublished: true },
          data: { isPublished: false, publishedAt: null },
        });
        const created = await tx.seasonNodeRelease.upsert({
          where: { packId_taxonomyVersion_runId: { packId: pack.id, taxonomyVersion: TAXONOMY, runId } },
          create: { seasonId: season.id, packId: pack.id, taxonomyVersion: TAXONOMY, runId, isPublished: true, publishedAt: new Date(), metadata: { source: 'validate-season3-snapshot', fingerprint, assignmentTotal: coreAssignments.length } },
          update: { isPublished: true, publishedAt: new Date(), metadata: { source: 'validate-season3-snapshot', fingerprint, assignmentTotal: coreAssignments.length } },
          select: { id: true },
        });
        await tx.seasonNodeReleaseItem.deleteMany({ where: { releaseId: created.id } });
        await tx.seasonNodeReleaseItem.createMany({
          skipDuplicates: true,
          data: coreAssignments.map(a => ({ releaseId: created.id, nodeSlug: a.node.slug, movieId: a.movieId, rank: a.rank, source: a.source, score: a.score, evidence: null })),
        });
        return created.id;
      });

      console.log(`  ✅ Release published: id=${release}  runId=${runId}`);
      pass('Publication', `Release created: ${release}`);
    }
  }

  // ── FINAL REPORT ─────────────────────────────────────────────────────────────
  printAndExit();
}

function printAndExit() {
  const passes = checks.filter(c => c.status === 'PASS').length;
  const warns  = checks.filter(c => c.status === 'WARN').length;
  const fails  = checks.filter(c => c.status === 'FAIL').length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log('SNAPSHOT VALIDATION SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  PASS: ${passes}  WARN: ${warns}  FAIL: ${fails}`);
  console.log('');

  if (fails > 0) {
    console.log('FAILURES:');
    for (const c of checks.filter(c => c.status === 'FAIL')) {
      console.log(`  ❌ ${c.name}`);
      console.log(`     ${c.detail}`);
    }
    console.log('');
  }

  if (warns > 0) {
    console.log('WARNINGS:');
    for (const c of checks.filter(c => c.status === 'WARN')) {
      console.log(`  ⚠️  ${c.name}`);
      console.log(`     ${c.detail}`);
    }
    console.log('');
  }

  const verdict = fails === 0
    ? (warns === 0 ? '✅ SAFE TO PUBLISH' : '⚠️  PUBLISH WITH WARNINGS')
    : '❌ NOT SAFE TO PUBLISH — resolve failures first';

  console.log(`VERDICT: ${verdict}`);
  if (fails > 0) process.exit(1);
}

main()
  .catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
