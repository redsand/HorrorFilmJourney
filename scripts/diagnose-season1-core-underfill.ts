import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SEASON1_NODE_GOVERNANCE_CONFIG } from '../src/config/seasons/season1-node-governance';
import { loadSeasonJourneyWorthinessConfig } from '../src/config/seasons/journey-worthiness';
import {
  resolvePerNodeCoreThreshold,
  resolvePerNodeTargetSize,
  toPairKey,
} from '../src/lib/nodes/governance/season1-governance';

type Candidate = {
  nodeSlug: string;
  movieId: string;
  finalScore: number;
  journeyScore: number;
};

type SelectInput = {
  candidates: Candidate[];
  curatedCoreByNode: Map<string, Set<string>>;
  targetByNode: Record<string, number>;
  coreThresholdByNode: Record<string, number>;
  journeyMinCore: number;
  maxNodesPerMovie: number;
  disallowedPairs: Array<[string, string]>;
};

type SelectOutput = {
  coreByNode: Map<string, Set<string>>;
  selectedCoreWeakKeys: Set<string>;
  rejectReasonByKey: Map<string, string>;
  stageCounts: {
    extendedPool: number;
    passJourneyMinCore: number;
    passCoreThreshold: number;
    passBoth: number;
    surviveConstraints: number;
    selectedCoreWeak: number;
  };
};

function parseCli(argv: string[]): { outputDir: string } {
  const arg = argv.find((item) => item.startsWith('--outputDir='));
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    outputDir: resolve(arg ? arg.slice('--outputDir='.length) : `artifacts/season1/core-underfill/${ts}`),
  };
}

function compareCandidate(a: Candidate, b: Candidate): number {
  return (b.finalScore - a.finalScore)
    || (b.journeyScore - a.journeyScore)
    || a.nodeSlug.localeCompare(b.nodeSlug)
    || a.movieId.localeCompare(b.movieId);
}

function cloneMapSet(input: Map<string, Set<string>>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [k, v] of input.entries()) out.set(k, new Set(v));
  return out;
}

function hasDisallowedConflict(existingNodes: Set<string>, candidateNode: string, pairs: Array<[string, string]>): boolean {
  for (const node of existingNodes) {
    for (const [a, b] of pairs) {
      if (toPairKey(node, candidateNode) === toPairKey(a, b)) return true;
    }
  }
  return false;
}

function runCoreSelection(input: SelectInput): SelectOutput {
  const stageCounts = {
    extendedPool: input.candidates.length,
    passJourneyMinCore: 0,
    passCoreThreshold: 0,
    passBoth: 0,
    surviveConstraints: 0,
    selectedCoreWeak: 0,
  };

  const passJourney = input.candidates.filter((c) => c.journeyScore >= input.journeyMinCore);
  stageCounts.passJourneyMinCore = passJourney.length;
  const passThreshold = input.candidates.filter((c) => c.finalScore >= (input.coreThresholdByNode[c.nodeSlug] ?? 1));
  stageCounts.passCoreThreshold = passThreshold.length;
  const passBoth = input.candidates.filter((c) =>
    c.journeyScore >= input.journeyMinCore && c.finalScore >= (input.coreThresholdByNode[c.nodeSlug] ?? 1));
  stageCounts.passBoth = passBoth.length;

  const coreByNode = cloneMapSet(input.curatedCoreByNode);
  const assignedCoreNodesByMovie = new Map<string, Set<string>>();
  for (const [nodeSlug, movieSet] of coreByNode.entries()) {
    for (const movieId of movieSet) {
      const s = assignedCoreNodesByMovie.get(movieId) ?? new Set<string>();
      s.add(nodeSlug);
      assignedCoreNodesByMovie.set(movieId, s);
    }
  }

  const selectedCoreWeakKeys = new Set<string>();
  const rejectReasonByKey = new Map<string, string>();
  const sorted = [...passBoth].sort(compareCandidate);
  for (const candidate of sorted) {
    const key = `${candidate.nodeSlug}::${candidate.movieId}`;
    const nodeCore = coreByNode.get(candidate.nodeSlug) ?? new Set<string>();
    if (nodeCore.has(candidate.movieId)) {
      continue;
    }
    const target = input.targetByNode[candidate.nodeSlug] ?? 0;
    if (nodeCore.size >= target) {
      rejectReasonByKey.set(key, 'node_target_full');
      continue;
    }
    const movieCoreNodes = assignedCoreNodesByMovie.get(candidate.movieId) ?? new Set<string>();
    if (movieCoreNodes.size >= input.maxNodesPerMovie) {
      rejectReasonByKey.set(key, 'max_nodes_per_movie_rejected');
      continue;
    }
    if (hasDisallowedConflict(movieCoreNodes, candidate.nodeSlug, input.disallowedPairs)) {
      rejectReasonByKey.set(key, 'disallowed_overlap_rejected');
      continue;
    }
    nodeCore.add(candidate.movieId);
    coreByNode.set(candidate.nodeSlug, nodeCore);
    movieCoreNodes.add(candidate.nodeSlug);
    assignedCoreNodesByMovie.set(candidate.movieId, movieCoreNodes);
    selectedCoreWeakKeys.add(key);
  }

  stageCounts.surviveConstraints = selectedCoreWeakKeys.size;
  stageCounts.selectedCoreWeak = selectedCoreWeakKeys.size;
  return { coreByNode, selectedCoreWeakKeys, rejectReasonByKey, stageCounts };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  await mkdir(cli.outputDir, { recursive: true });
  await mkdir(resolve('docs'), { recursive: true });

  const prisma = new PrismaClient();
  try {
    const season = await prisma.season.findUnique({
      where: { slug: 'season-1' },
      select: { id: true, packs: { where: { slug: 'horror' }, select: { id: true } } },
    });
    if (!season || season.packs.length === 0) throw new Error('season-1/horror pack missing');
    const packId = season.packs[0]!.id;

    const release = await prisma.seasonNodeRelease.findFirst({
      where: { seasonId: season.id, packId, isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, runId: true, taxonomyVersion: true, publishedAt: true },
    });
    if (!release) throw new Error('no published season-1 release');

    const rows = await prisma.nodeMovie.findMany({
      where: { node: { packId }, runId: release.runId, taxonomyVersion: release.taxonomyVersion },
      select: {
        node: { select: { slug: true } },
        movieId: true,
        tier: true,
        source: true,
        finalScore: true,
        journeyScore: true,
        movie: { select: { tmdbId: true, title: true, year: true } },
      },
    });

    const nodeSlugs = Object.keys(SEASON1_NODE_GOVERNANCE_CONFIG.nodes);
    const journeyConfig = loadSeasonJourneyWorthinessConfig('season-1');
    const journeyMinCore = journeyConfig.gates?.journeyMinCore ?? 0.6;

    const targetByNode: Record<string, number> = {};
    const coreThresholdByNode: Record<string, number> = {};
    for (const slug of nodeSlugs) {
      targetByNode[slug] = resolvePerNodeTargetSize(SEASON1_NODE_GOVERNANCE_CONFIG, slug);
      coreThresholdByNode[slug] = resolvePerNodeCoreThreshold(SEASON1_NODE_GOVERNANCE_CONFIG, slug);
    }

    const curatedCoreByNode = new Map<string, Set<string>>();
    for (const slug of nodeSlugs) curatedCoreByNode.set(slug, new Set<string>());
    const weakCandidates: Candidate[] = [];
    const extendedRows = rows.filter((r) => r.source === 'weak_supervision' && r.tier === 'EXTENDED');
    const weakAllRows = rows.filter((r) => r.source === 'weak_supervision');
    for (const row of rows) {
      if (row.source !== 'weak_supervision' && row.tier === 'CORE') {
        const set = curatedCoreByNode.get(row.node.slug) ?? new Set<string>();
        set.add(row.movieId);
        curatedCoreByNode.set(row.node.slug, set);
      }
    }
    for (const row of weakAllRows) {
      weakCandidates.push({
        nodeSlug: row.node.slug,
        movieId: row.movieId,
        finalScore: row.finalScore,
        journeyScore: row.journeyScore,
      });
    }

    const baselineSelection = runCoreSelection({
      candidates: weakCandidates,
      curatedCoreByNode,
      targetByNode,
      coreThresholdByNode,
      journeyMinCore,
      maxNodesPerMovie: SEASON1_NODE_GOVERNANCE_CONFIG.defaults.maxNodesPerMovie,
      disallowedPairs: SEASON1_NODE_GOVERNANCE_CONFIG.overlapConstraints.disallowedPairs,
    });

    const coreWeakCurrentKeys = new Set(
      rows
        .filter((r) => r.source === 'weak_supervision' && r.tier === 'CORE')
        .map((r) => `${r.node.slug}::${r.movieId}`),
    );

    const movieMeta = new Map(rows.map((r) => [r.movieId, { tmdbId: r.movie.tmdbId, title: r.movie.title, year: r.movie.year }]));
    const coreByNodeJson: Record<string, unknown> = {};
    const boundaryCliffs: Record<string, unknown> = {};
    const failReasonCountsGlobal = {
      not_enough_above_core_threshold: 0,
      not_enough_above_journey_min_core: 0,
      maxNodesPerMovieRejected: 0,
      disallowedOverlapRejected: 0,
      nodeTargetReachedByHigherRank: 0,
    };

    for (const slug of nodeSlugs) {
      const nodeRows = weakAllRows
        .filter((r) => r.node.slug === slug)
        .map((r) => ({ movieId: r.movieId, finalScore: r.finalScore, journeyScore: r.journeyScore }))
        .sort((a, b) => compareCandidate({ ...a, nodeSlug: slug }, { ...b, nodeSlug: slug }));
      const coreCount = rows.filter((r) => r.node.slug === slug && r.tier === 'CORE').length;
      const extendedCount = rows.filter((r) => r.node.slug === slug && r.tier === 'EXTENDED').length;
      const targetSize = targetByNode[slug];
      const coreThreshold = coreThresholdByNode[slug];
      const aboveJourney = nodeRows.filter((r) => r.journeyScore >= journeyMinCore);
      const aboveThreshold = nodeRows.filter((r) => r.finalScore >= coreThreshold);
      const aboveBoth = nodeRows.filter((r) => r.journeyScore >= journeyMinCore && r.finalScore >= coreThreshold);
      const atTarget = aboveBoth[targetSize - 1]?.finalScore ?? null;
      const belowTarget = aboveBoth[targetSize]?.finalScore ?? null;

      const promotedKeysForNode = new Set(
        [...baselineSelection.selectedCoreWeakKeys].filter((k) => k.startsWith(`${slug}::`)),
      );
      const rejectedMaxNodes = [...baselineSelection.rejectReasonByKey.entries()]
        .filter(([k, reason]) => k.startsWith(`${slug}::`) && reason === 'max_nodes_per_movie_rejected').length;
      const rejectedDisallowed = [...baselineSelection.rejectReasonByKey.entries()]
        .filter(([k, reason]) => k.startsWith(`${slug}::`) && reason === 'disallowed_overlap_rejected').length;
      const rejectedTarget = [...baselineSelection.rejectReasonByKey.entries()]
        .filter(([k, reason]) => k.startsWith(`${slug}::`) && reason === 'node_target_full').length;

      const underfill = coreCount < targetSize;
      if (underfill) {
        if (aboveThreshold.length < targetSize) failReasonCountsGlobal.not_enough_above_core_threshold += 1;
        if (aboveJourney.length < targetSize) failReasonCountsGlobal.not_enough_above_journey_min_core += 1;
        failReasonCountsGlobal.maxNodesPerMovieRejected += rejectedMaxNodes;
        failReasonCountsGlobal.disallowedOverlapRejected += rejectedDisallowed;
        failReasonCountsGlobal.nodeTargetReachedByHigherRank += rejectedTarget;
      }

      coreByNodeJson[slug] = {
        extendedCount,
        coreCount,
        targetSize,
        coreThreshold,
        journeyMinCore,
        scoreAtCoreBoundary: atTarget,
        scoreBelowCoreBoundary: belowTarget,
        promotedWeakCount: promotedKeysForNode.size,
        underfillReasons: underfill
          ? {
            notEnoughCandidatesAboveCoreThreshold: aboveThreshold.length < targetSize,
            notEnoughCandidatesAboveJourneyMinCore: aboveJourney.length < targetSize,
            maxNodesPerMovieRejected: rejectedMaxNodes,
            disallowedOverlapRejected: rejectedDisallowed,
            nodeTargetReachedByHigherRank: rejectedTarget,
          }
          : null,
      };

      boundaryCliffs[slug] = {
        targetSize,
        scoreAtCoreBoundary: atTarget,
        scoreBelowCoreBoundary: belowTarget,
        cliffDelta: (typeof atTarget === 'number' && typeof belowTarget === 'number')
          ? Number((atTarget - belowTarget).toFixed(6))
          : null,
        availableAboveBoth: aboveBoth.length,
      };
    }

    const extendedFailExamples = extendedRows
      .map((row) => {
        const key = `${row.node.slug}::${row.movieId}`;
        let reason = '';
        if (row.journeyScore < journeyMinCore) {
          reason = 'journey_min_core_failed';
        } else if (row.finalScore < coreThresholdByNode[row.node.slug]) {
          reason = 'core_threshold_failed';
        } else {
          const rejected = baselineSelection.rejectReasonByKey.get(key);
          reason = rejected ?? 'not_selected_unknown';
        }
        return {
          movieId: row.movieId,
          tmdbId: row.movie.tmdbId,
          title: row.movie.title,
          year: row.movie.year,
          nodeSlug: row.node.slug,
          journeyScore: Number(row.journeyScore.toFixed(6)),
          finalScore: Number(row.finalScore.toFixed(6)),
          failureReason: reason,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore || b.journeyScore - a.journeyScore || a.title.localeCompare(b.title))
      .slice(0, 50);

    const globalFunnel = {
      extendedPool: extendedRows.length,
      passJourneyMinCore: extendedRows.filter((r) => r.journeyScore >= journeyMinCore).length,
      passCoreThreshold: extendedRows.filter((r) => r.finalScore >= coreThresholdByNode[r.node.slug]).length,
      passBoth: extendedRows.filter((r) => r.journeyScore >= journeyMinCore && r.finalScore >= coreThresholdByNode[r.node.slug]).length,
      surviveConstraints: extendedRows.filter((r) => baselineSelection.rejectReasonByKey.get(`${r.node.slug}::${r.movieId}`) === undefined
        && r.journeyScore >= journeyMinCore
        && r.finalScore >= coreThresholdByNode[r.node.slug]).length,
      selectedCoreFromExtended: extendedRows.filter((r) => coreWeakCurrentKeys.has(`${r.node.slug}::${r.movieId}`)).length,
      promotionPoolWeakAll: weakAllRows.length,
      promotionPoolPassBoth: weakAllRows.filter((r) => r.journeyScore >= journeyMinCore && r.finalScore >= coreThresholdByNode[r.node.slug]).length,
      promotionPoolSelectedCoreWeak: baselineSelection.selectedCoreWeakKeys.size,
    };

    const strictBaselineCoreUnique = new Set<string>();
    for (const set of baselineSelection.coreByNode.values()) for (const movieId of set) strictBaselineCoreUnique.add(movieId);
    const strictBaselineCount = strictBaselineCoreUnique.size;
    const currentPublishedCoreUnique = new Set(rows.filter((r) => r.tier === 'CORE').map((r) => r.movieId)).size;

    const scenario = (name: string, opts: { coreThresholdDelta?: number; journeyMinCoreDelta?: number; targetDelta?: number; maxNodesPerMovie?: number }) => {
      const thresholds = Object.fromEntries(nodeSlugs.map((slug) => [slug, coreThresholdByNode[slug] + (opts.coreThresholdDelta ?? 0)]));
      const targets = Object.fromEntries(nodeSlugs.map((slug) => [slug, targetByNode[slug] + (opts.targetDelta ?? 0)]));
      const selection = runCoreSelection({
        candidates: weakCandidates,
        curatedCoreByNode,
        targetByNode: targets,
        coreThresholdByNode: thresholds,
        journeyMinCore: journeyMinCore + (opts.journeyMinCoreDelta ?? 0),
        maxNodesPerMovie: opts.maxNodesPerMovie ?? SEASON1_NODE_GOVERNANCE_CONFIG.defaults.maxNodesPerMovie,
        disallowedPairs: SEASON1_NODE_GOVERNANCE_CONFIG.overlapConstraints.disallowedPairs,
      });
      const coreUnique = new Set<string>();
      for (const set of selection.coreByNode.values()) for (const movieId of set) coreUnique.add(movieId);
      return {
        name,
        coreUnique: coreUnique.size,
        deltaVsStrictBaseline: coreUnique.size - strictBaselineCount,
        deltaVsCurrentPublishedCore: coreUnique.size - currentPublishedCoreUnique,
      };
    };

    const scenarioResults = [
      scenario('lower_coreThreshold_by_0.03', { coreThresholdDelta: -0.03 }),
      scenario('lower_journeyMinCore_by_0.03', { journeyMinCoreDelta: -0.03 }),
      scenario('increase_targetSize_core_only_plus_20', { targetDelta: 20 }),
      scenario('relax_maxNodesPerMovie_core_only_3_to_4', { maxNodesPerMovie: 4 }),
    ];
    const riskRank: Record<string, number> = {
      'relax_maxNodesPerMovie_core_only_3_to_4': 1,
      'increase_targetSize_core_only_plus_20': 2,
      'lower_coreThreshold_by_0.03': 3,
      'lower_journeyMinCore_by_0.03': 4,
    };
    const positiveSafe = scenarioResults
      .filter((row) => row.deltaVsStrictBaseline > 0)
      .sort((a, b) => (riskRank[a.name] - riskRank[b.name]) || (b.deltaVsStrictBaseline - a.deltaVsStrictBaseline));
    const fallback = [...scenarioResults].sort((a, b) => b.deltaVsStrictBaseline - a.deltaVsStrictBaseline || riskRank[a.name] - riskRank[b.name]);
    const recommendation = positiveSafe[0] ?? fallback[0];

    const promotionFailReasons = {
      generatedAt: new Date().toISOString(),
      release: {
        id: release.id,
        runId: release.runId,
        taxonomyVersion: release.taxonomyVersion,
        publishedAt: release.publishedAt?.toISOString() ?? null,
      },
      globalPromotionFunnel: globalFunnel,
      failReasonCountsForUnderfilledNodes: failReasonCountsGlobal,
      top50ExtendedPromotionFailures: extendedFailExamples,
      parameterSimulation: {
        strictBaselineCoreUnique: strictBaselineCount,
        currentPublishedCoreUnique,
        scenarios: scenarioResults,
        recommendedLowestRiskHighImpact: recommendation,
      },
    };

    await writeFile(resolve(cli.outputDir, 'core-by-node.json'), `${JSON.stringify(coreByNodeJson, null, 2)}\n`, 'utf8');
    await writeFile(resolve(cli.outputDir, 'promotion-fail-reasons.json'), `${JSON.stringify(promotionFailReasons, null, 2)}\n`, 'utf8');
    await writeFile(resolve(cli.outputDir, 'boundary-cliffs.json'), `${JSON.stringify(boundaryCliffs, null, 2)}\n`, 'utf8');

    const doc = [
      '# Season 1 Core Underfill Diagnosis',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Artifacts: \`${cli.outputDir}\``,
      '',
      '## Why Core Is 295 While TotalUnique Is 847',
      '',
      '- Core requires stricter promotion constraints (journeyMinCore + coreThreshold + overlap/maxNodes + target caps).',
      '- Extended includes many titles that remain high quality for node fit but fail strict core promotion gates.',
      `- Current release: \`${release.id}\` runId=\`${release.runId}\` taxonomy=\`${release.taxonomyVersion}\`.`,
      '',
      '## Global Promotion Funnel',
      '',
      `- Extended pool: ${globalFunnel.extendedPool}`,
      `- Pass journeyMinCore (${journeyMinCore.toFixed(2)}): ${globalFunnel.passJourneyMinCore}`,
      `- Pass coreThreshold: ${globalFunnel.passCoreThreshold}`,
      `- Pass both: ${globalFunnel.passBoth}`,
      `- Survive constraints: ${globalFunnel.surviveConstraints}`,
      `- Selected core from extended: ${globalFunnel.selectedCoreFromExtended}`,
      `- Promotion pool (weak core + extended): ${globalFunnel.promotionPoolWeakAll}`,
      `- Promotion pool pass both: ${globalFunnel.promotionPoolPassBoth}`,
      `- Promotion pool selected core weak: ${globalFunnel.promotionPoolSelectedCoreWeak}`,
      '',
      '## Primary Underfill Drivers',
      '',
      `- Not enough above coreThreshold (underfilled nodes): ${failReasonCountsGlobal.not_enough_above_core_threshold}`,
      `- Not enough above journeyMinCore (underfilled nodes): ${failReasonCountsGlobal.not_enough_above_journey_min_core}`,
      `- maxNodesPerMovie rejects: ${failReasonCountsGlobal.maxNodesPerMovieRejected}`,
      `- disallowed overlap rejects: ${failReasonCountsGlobal.disallowedOverlapRejected}`,
      '',
      '## Minimal Safe Fix Recommendation',
      '',
      `- Strict-baseline core unique: ${strictBaselineCount}. Current published core unique: ${currentPublishedCoreUnique}.`,
      `- Recommended single change: **${recommendation.name}** (delta vs strict baseline: ${recommendation.deltaVsStrictBaseline >= 0 ? '+' : ''}${recommendation.deltaVsStrictBaseline}).`,
      '- Safety rule applied: constraints-side changes are preferred over lowering score thresholds or journey minimum.',
    ].join('\n');
    await writeFile(resolve('docs/season1-core-underfill-diagnosis.md'), `${doc}\n`, 'utf8');

    console.log(JSON.stringify({
      outputDir: cli.outputDir,
      releaseId: release.id,
      runId: release.runId,
      journeyMinCore,
      globalPromotionFunnel: globalFunnel,
      recommendation,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('season1 core underfill diagnosis failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
