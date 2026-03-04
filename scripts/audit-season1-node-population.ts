import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  buildSeason1LabelingFunctions,
  inferNodeProbabilities,
} from '../src/lib/nodes/weak-supervision/index.ts';
import {
  applySeason1GovernanceEnvOverrides,
  loadSeason1NodeGovernanceConfig,
  resolvePerNodeMinEligible,
  resolvePerNodeTargetSize,
} from '../src/lib/nodes/governance/season1-governance.ts';
import {
  type GoldFixture,
  detectUnexpectedCooccurrence,
  evaluateGoldSample,
  normalizeTitle,
} from '../src/lib/audit/season1-node-audit.ts';

type TaxonomyNode = {
  slug: string;
  name: string;
  titles: Array<{ title: string; year: number }>;
};

type TaxonomySpec = {
  seasonSlug: string;
  packSlug: string;
  nodes: TaxonomyNode[];
};

type AuditMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  genres: string[];
};

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function movieLookupKey(title: string, year: number): string {
  return `${normalizeTitle(title)}::${year}`;
}

async function loadTaxonomy(path: string): Promise<TaxonomySpec> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as TaxonomySpec;
}

async function loadGoldFixture(path: string): Promise<GoldFixture> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as GoldFixture;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const taxonomyPath = resolve('docs/season/season-1-horror-subgenre-curriculum.json');
  const fixturePath = resolve('tests/fixtures/season1-node-gold.json');

  try {
    const taxonomy = await loadTaxonomy(taxonomyPath);
    const fixture = await loadGoldFixture(fixturePath);
    const governanceRaw = await loadSeason1NodeGovernanceConfig();
    const governance = applySeason1GovernanceEnvOverrides(governanceRaw, taxonomy.nodes.map((node) => node.slug));

    const season = await prisma.season.findUnique({
      where: { slug: taxonomy.seasonSlug },
      select: {
        id: true,
        slug: true,
        packs: {
          where: { slug: taxonomy.packSlug },
          select: {
            id: true,
            slug: true,
            nodes: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                slug: true,
                name: true,
                taxonomyVersion: true,
                orderIndex: true,
                movies: {
                  orderBy: { rank: 'asc' },
                  select: {
                    rank: true,
                    source: true,
                    score: true,
                    evidence: true,
                    runId: true,
                    taxonomyVersion: true,
                    movie: {
                      select: {
                        id: true,
                        tmdbId: true,
                        title: true,
                        year: true,
                        genres: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!season || season.packs.length === 0) {
      throw new Error(`Season/pack not found for ${taxonomy.seasonSlug}/${taxonomy.packSlug}`);
    }

    const pack = season.packs[0]!;
    const taxonomyNodeSlugs = taxonomy.nodes.map((node) => node.slug);
    const publishedRelease = await prisma.seasonNodeRelease.findFirst({
      where: {
        seasonId: season.id,
        packId: pack.id,
        isPublished: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        taxonomyVersion: true,
        runId: true,
        publishedAt: true,
      },
    });

    const allMoviesRaw = await prisma.movie.findMany({
      select: {
        id: true,
        tmdbId: true,
        title: true,
        year: true,
        genres: true,
      },
    });
    const allMovies: AuditMovie[] = allMoviesRaw.map((movie) => ({
      id: movie.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      genres: parseJsonStringArray(movie.genres),
    }));

    const movieById = new Map(allMovies.map((movie) => [movie.id, movie]));
    const movieByLookup = new Map(allMovies.map((movie) => [movieLookupKey(movie.title, movie.year ?? -1), movie]));

    const assignmentsByMovie = new Map<string, string[]>();
    const assignmentsByNode = new Map<string, string[]>();
    const sourceCountsByNode = new Map<string, Record<string, number>>();

    for (const node of pack.nodes) {
      assignmentsByNode.set(node.slug, node.movies.map((entry) => entry.movie.id));
      const sourceCounts: Record<string, number> = {};
      for (const entry of node.movies) {
        const list = assignmentsByMovie.get(entry.movie.id) ?? [];
        list.push(node.slug);
        assignmentsByMovie.set(entry.movie.id, list);

        sourceCounts[entry.source] = (sourceCounts[entry.source] ?? 0) + 1;
      }
      sourceCountsByNode.set(node.slug, sourceCounts);
    }

    const horrorMovies = allMovies.filter((movie) => movie.genres.includes('horror'));
    const filmsWithNoNodes = horrorMovies.filter((movie) => !assignmentsByMovie.has(movie.id));

    const tooManyNodeThreshold = governance.defaults.maxNodesPerMovie;
    const filmsWithTooManyNodes = [...assignmentsByMovie.entries()]
      .filter(([, nodes]) => nodes.length > tooManyNodeThreshold)
      .map(([movieId, nodes]) => ({ movie: movieById.get(movieId), nodeCount: nodes.length, nodes }))
      .filter((entry): entry is { movie: AuditMovie; nodeCount: number; nodes: string[] } => Boolean(entry.movie))
      .sort((a, b) => b.nodeCount - a.nodeCount || a.movie.tmdbId - b.movie.tmdbId);

    const nodeLfs = buildSeason1LabelingFunctions(taxonomyNodeSlugs);

    const topEvidenceByNode = pack.nodes.map((node) => {
      const examples = node.movies
        .filter((entry) => entry.source === 'weak_supervision')
        .slice(0, 3)
        .map((entry) => {
          const evidenceList = Array.isArray(entry.evidence)
            ? entry.evidence
            : entry.evidence && typeof entry.evidence === 'object' && Array.isArray((entry.evidence as Record<string, unknown>).evidence)
              ? ((entry.evidence as Record<string, unknown>).evidence as unknown[])
                .filter((v): v is string => typeof v === 'string')
              : [];

          return {
            movie: `${entry.movie.title} (${entry.movie.year ?? 'n/a'})`,
            score: entry.score,
            evidence: evidenceList.slice(0, 3),
          };
        });
      return {
        node: node.slug,
        examples,
      };
    });

    const cooccurrence = detectUnexpectedCooccurrence(assignmentsByMovie)
      .map((entry) => ({
        pair: entry.pair,
        count: entry.movieIds.length,
        sampleMovies: entry.movieIds.slice(0, 8).map((id) => {
          const movie = movieById.get(id);
          return movie ? `${movie.title} (${movie.year ?? 'n/a'})` : id;
        }),
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);

    const overlapPairCount = (left: string, right: string): number => {
      const [a, b] = left < right ? [left, right] : [right, left];
      let count = 0;
      for (const nodes of assignmentsByMovie.values()) {
        const set = new Set(nodes);
        if (set.has(a) && set.has(b)) {
          count += 1;
        }
      }
      return count;
    };

    const disallowedOverlap = governance.overlapConstraints.disallowedPairs.map(([a, b]) => ({
      pair: [a, b] as [string, string],
      count: overlapPairCount(a, b),
    }));

    const penalizedOverlap = governance.overlapConstraints.penalizedPairs.map((rule) => ({
      pair: [rule.a, rule.b] as [string, string],
      count: overlapPairCount(rule.a, rule.b),
      penalty: rule.penalty,
    }));

    const fixtureFindings = fixture.samples.map((sample) => {
      const foundByTmdb = typeof sample.tmdbId === 'number'
        ? allMovies.find((movie) => movie.tmdbId === sample.tmdbId)
        : null;
      const movie = foundByTmdb ?? movieByLookup.get(movieLookupKey(sample.title, sample.year)) ?? null;
      if (!movie) {
        return {
          sample,
          found: false,
          assignedNodes: [] as string[],
          overlap: [] as string[],
          missingExpected: sample.expectedNodes,
          unexpectedAssigned: [] as string[],
          topWeakNodes: [] as Array<{ node: string; probability: number; evidence: string[] }>,
        };
      }

      const assignedNodes = assignmentsByMovie.get(movie.id) ?? [];
      const evalResult = evaluateGoldSample(sample.expectedNodes, assignedNodes);
      const inferred = inferNodeProbabilities(movie, taxonomyNodeSlugs, nodeLfs)
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 3)
        .map((entry) => ({
          node: entry.nodeSlug,
          probability: Number(entry.probability.toFixed(4)),
          evidence: entry.fired.slice(0, 2).flatMap((f) => f.evidence).slice(0, 3),
        }));

      return {
        sample,
        found: true,
        assignedNodes: evalResult.assigned,
        overlap: evalResult.overlap,
        missingExpected: evalResult.missingExpected,
        unexpectedAssigned: evalResult.unexpectedAssigned,
        topWeakNodes: inferred,
      };
    });

    const fixtureMissingMovies = fixtureFindings.filter((row) => !row.found);
    const fixtureHardMismatches = fixtureFindings.filter((row) => row.found && row.overlap.length === 0);

    console.log('=== Season 1 Node Population Audit ===');
    console.log(`Season: ${season.slug}`);
    console.log(`Pack: ${pack.slug}`);
    console.log(`Taxonomy version (config): ${governance.taxonomyVersion}`);
    console.log(`Published snapshot: ${publishedRelease ? `${publishedRelease.id} taxonomy=${publishedRelease.taxonomyVersion} runId=${publishedRelease.runId}` : 'none'}`);
    console.log(`Taxonomy nodes: ${taxonomyNodeSlugs.length}`);
    console.log(`DB nodes: ${pack.nodes.length}`);
    console.log(`Total node assignments: ${[...assignmentsByMovie.values()].reduce((acc, nodes) => acc + nodes.length, 0)}`);
    console.log(`Unique assigned movies: ${assignmentsByMovie.size}`);
    console.log('');

    console.log('Coverage / anomaly summary:');
    console.log(`- filmsWithNoNodes (horror-tagged catalog): ${filmsWithNoNodes.length}`);
    console.log(`- filmsWithTooManyNodes (>${tooManyNodeThreshold}): ${filmsWithTooManyNodes.length}`);
    console.log(`- nodesNeverUsed: ${taxonomyNodeSlugs.filter((slug) => (assignmentsByNode.get(slug)?.length ?? 0) === 0).length}`);
    console.log(`- unexpectedCooccurrencePairs: ${cooccurrence.length}`);
    console.log(`- disallowedOverlapPairsWithHits: ${disallowedOverlap.filter((entry) => entry.count > 0).length}`);
    console.log('');

    console.log('Node assignment counts/source mix:');
    for (const node of pack.nodes) {
      const sourceCounts = sourceCountsByNode.get(node.slug) ?? {};
      const sourceSummary = Object.entries(sourceCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([source, count]) => `${source}:${count}`)
        .join(', ');
      const target = resolvePerNodeTargetSize(governance, node.slug);
      const min = resolvePerNodeMinEligible(governance, node.slug);
      console.log(`- ${node.slug}: ${node.movies.length} [min=${min} target=${target}] (${sourceSummary || 'none'})`);
    }
    console.log('');

    console.log('Top evidence examples per node (weak supervision):');
    for (const entry of topEvidenceByNode) {
      const summary = entry.examples.length > 0
        ? entry.examples.map((example) => `${example.movie} p=${example.score ?? 'n/a'} [${example.evidence.join(' | ')}]`).join(' ; ')
        : 'none';
      console.log(`- ${entry.node}: ${summary}`);
    }

    console.log('');
    console.log('Gold fixture results:');
    console.log(`- samples: ${fixture.samples.length}`);
    console.log(`- missingMovies: ${fixtureMissingMovies.length}`);
    console.log(`- hardMismatches(no overlap): ${fixtureHardMismatches.length}`);

    for (const finding of fixtureFindings) {
      const status = !finding.found
        ? 'MISSING_MOVIE'
        : finding.overlap.length === 0
          ? 'MISMATCH'
          : finding.missingExpected.length > 0
            ? 'PARTIAL'
            : 'OK';
      console.log(`- [${status}] ${finding.sample.title} (${finding.sample.year})`);
      console.log(`  expected=${finding.sample.expectedNodes.join('|')}`);
      console.log(`  assigned=${finding.assignedNodes.join('|') || 'none'}`);
      if (finding.missingExpected.length > 0) {
        console.log(`  missingExpected=${finding.missingExpected.join('|')}`);
      }
      if (finding.unexpectedAssigned.length > 0) {
        console.log(`  unexpectedAssigned=${finding.unexpectedAssigned.join('|')}`);
      }
      if (finding.topWeakNodes.length > 0) {
        const top = finding.topWeakNodes.map((item) => `${item.node}:${item.probability}`).join(', ');
        console.log(`  topWeakNodes=${top}`);
      }
    }

    console.log('');
    console.log('Top films by node count:');
    for (const item of filmsWithTooManyNodes.slice(0, 20)) {
      console.log(`- ${item.movie.title} (${item.movie.year ?? 'n/a'}): ${item.nodeCount} -> ${item.nodes.join('|')}`);
    }

    console.log('');
    console.log('Disallowed overlap counts:');
    for (const item of disallowedOverlap) {
      if (item.count > 0) {
        console.log(`- ${item.pair[0]} + ${item.pair[1]}: ${item.count}`);
      }
    }

    console.log('');
    console.log('Top penalized overlap counts:');
    for (const item of penalizedOverlap.filter((row) => row.count > 0).sort((a, b) => b.count - a.count).slice(0, 20)) {
      console.log(`- ${item.pair[0]} + ${item.pair[1]}: ${item.count} (penalty=${item.penalty})`);
    }

    console.log('');
    console.log('Unexpected pair co-occurrence:');
    for (const item of cooccurrence) {
      console.log(`- ${item.pair[0]} + ${item.pair[1]}: ${item.count}`);
      if (item.sampleMovies.length > 0) {
        console.log(`  sample=${item.sampleMovies.join('; ')}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Season 1 node population audit failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
