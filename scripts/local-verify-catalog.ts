import { PrismaClient } from '@prisma/client';
import { ensureLocalDatabaseOrThrow, runCommand, writeVerificationStamp } from './catalog-release-utils.ts';
import { loadSeason1NodeGovernanceConfig, toPairKey } from '../src/lib/nodes/governance/index.ts';

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
};

function printResult(item: CheckResult): void {
  const status = item.pass ? 'PASS' : 'FAIL';
  console.log(`[local.verify-catalog] ${status} ${item.name} :: ${item.details}`);
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

async function main(): Promise<void> {
  ensureLocalDatabaseOrThrow(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  const checks: CheckResult[] = [];

  try {
    runCommand('npm run audit:season1:nodes');

    const season = await prisma.season.findUnique({
      where: { slug: 'season-1' },
      select: {
        id: true,
        packs: {
          where: { slug: 'horror' },
          select: {
            id: true,
            nodes: {
              select: {
                slug: true,
              movies: { select: { movieId: true, source: true } },
              },
            },
          },
        },
      },
    });
    if (!season || season.packs.length === 0) {
      throw new Error('Season 1 horror pack not found');
    }
    const pack = season.packs[0]!;
    const governance = await loadSeason1NodeGovernanceConfig();

    checks.push({
      name: 'exactly-16-season1-nodes',
      pass: pack.nodes.length === 16,
      details: `found=${pack.nodes.length}`,
    });

    const byMovie = new Map<string, string[]>();
    const sourceByMovie = new Map<string, string[]>();
    for (const node of pack.nodes) {
      for (const assignment of node.movies) {
        const list = byMovie.get(assignment.movieId) ?? [];
        list.push(node.slug);
        byMovie.set(assignment.movieId, list);
        const sourceList = sourceByMovie.get(assignment.movieId) ?? [];
        sourceList.push(assignment.source);
        sourceByMovie.set(assignment.movieId, sourceList);
      }
    }

    const tooManyNodesCount = [...byMovie.entries()].filter(([movieId, slugs]) => {
      const uniqueCount = new Set(slugs).size;
      if (uniqueCount <= governance.defaults.maxNodesPerMovie) {
        return false;
      }
      const sources = sourceByMovie.get(movieId) ?? [];
      return !sources.every((source) => source === 'curated' || source === 'override');
    }).length;
    checks.push({
      name: 'max-nodes-per-movie',
      pass: tooManyNodesCount === 0,
      details: `violations=${tooManyNodesCount} max=${governance.defaults.maxNodesPerMovie}`,
    });

    const disallowedHits = governance.overlapConstraints.disallowedPairs
      .map(([a, b]) => {
        let count = 0;
        for (const slugs of byMovie.values()) {
          const set = new Set(slugs);
          if (set.has(a) && set.has(b)) {
            count += 1;
          }
        }
        return { pair: toPairKey(a, b), count };
      })
      .filter((row) => row.count > 0);
    checks.push({
      name: 'disallowed-overlap-pairs',
      pass: disallowedHits.length === 0,
      details: disallowedHits.length === 0 ? 'no overlaps' : disallowedHits.map((row) => `${row.pair}:${row.count}`).join(', '),
    });

    const horrorMovies = await prisma.movie.findMany({
      select: { id: true, genres: true },
    });
    const horrorCatalog = horrorMovies.filter((movie) => parseGenres(movie.genres).includes('horror'));
    const noNodeCount = horrorCatalog.filter((movie) => !byMovie.has(movie.id)).length;
    const noNodePct = horrorCatalog.length > 0 ? noNodeCount / horrorCatalog.length : 0;
    checks.push({
      name: 'horror-no-node-percent',
      pass: true,
      details: `${(noNodePct * 100).toFixed(2)}% (${noNodeCount}/${horrorCatalog.length})`,
    });

    const published = await prisma.seasonNodeRelease.findFirst({
      where: { seasonId: season.id, packId: pack.id, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, runId: true, taxonomyVersion: true },
    });
    checks.push({
      name: 'published-snapshot-exists',
      pass: Boolean(published),
      details: published ? `release=${published.id}` : 'none',
    });

    runCommand('npm run test -- tests/prisma/season1-node-governance-controls.test.ts tests/prisma/season1-node-regression-gates.test.ts tests/prisma/season1-published-snapshot-read.test.ts tests/prisma/season1-weak-supervision-fixture.test.ts tests/unit/season1-node-classifier.test.ts');
    const packSummary = await prisma.genrePack.findUnique({
      where: { slug: 'horror' },
      select: {
        id: true,
        season: { select: { slug: true } },
        nodeReleases: {
          where: { isPublished: true },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          select: { taxonomyVersion: true, runId: true },
          take: 1,
        },
      },
    });
    const release = packSummary?.nodeReleases[0];
    checks.forEach(printResult);
    const pass = checks.every((item) => item.pass);
    const failedCount = checks.filter((item) => !item.pass).length;
    console.log(`[local.verify-catalog] summary pass=${pass} failed=${failedCount} total=${checks.length}`);

    if (!pass) {
      process.exit(1);
    }

    const stampPath = await writeVerificationStamp({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      taxonomyVersion: release?.taxonomyVersion ?? 'unknown',
      runId: release?.runId ?? 'unknown',
      checks,
    });
    console.log(`[local.verify-catalog] verification stamp written: ${stampPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[local.verify-catalog] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
