import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { scoreMovieForNodes } from '../src/lib/nodes/scoring/scoreMovieForNodes';
import { loadSeasonOntology } from '../src/lib/ontology/loadSeasonOntology';
import { loadSeasonPrototypePack } from '../src/lib/ontology/loadSeasonPrototypePack';
import { getSeason1MustIncludeForNode } from '../src/config/seasons/season1-must-include';

type OmissionEntry = {
  movieId: string;
  tmdbId: number;
  title: string;
  year: number | null;
  journeyScore: number;
  exclusionReason: string;
  bestNode?: { nodeSlug: string; nodeScore: number; qualityFloor: number } | null;
};

type OmissionToplistsArtifact = {
  snapshot: {
    release: {
      releaseId: string;
      runId: string;
      taxonomyVersion: string;
    };
  };
  top50Omissions: OmissionEntry[];
};

type ParsedMovie = {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  genres: string[];
  keywords: string[];
  synopsis: string | null;
  embedding: number[] | null;
};

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
  return parsed.length > 0 ? parsed : null;
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function latestCoverageAuditDir(root: string): Promise<string> {
  return readdir(root, { withFileTypes: true }).then((entries) => {
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));
    if (dirs.length === 0) {
      throw new Error(`No coverage audit directories found in ${root}`);
    }
    return resolve(root, dirs[0]!);
  });
}

function classifyBucket(input: {
  weakScore: number;
  prototypeScore: number;
  negativeSignalsTriggered: string[];
}): 'A_missing_prototypes' | 'B_missing_lfs_keywords' | 'C_negative_or_ontology_conflict' {
  if (input.negativeSignalsTriggered.length > 0) {
    return 'C_negative_or_ontology_conflict';
  }
  if (input.prototypeScore < 0.5 && input.weakScore >= 0.62) {
    return 'A_missing_prototypes';
  }
  if (input.weakScore < 0.62 && input.prototypeScore >= 0.5) {
    return 'B_missing_lfs_keywords';
  }
  return (input.prototypeScore < input.weakScore)
    ? 'A_missing_prototypes'
    : 'B_missing_lfs_keywords';
}

async function main(): Promise<void> {
  const coverageRoot = resolve('artifacts/season1/coverage-audit');
  const latestDir = process.env.SEASON1_OMISSION_AUDIT_DIR?.trim()
    ? resolve(process.env.SEASON1_OMISSION_AUDIT_DIR.trim())
    : await latestCoverageAuditDir(coverageRoot);
  const artifactPath = resolve(latestDir, 'omissions-toplists.json');
  const raw = await readFile(artifactPath, 'utf8');
  const artifact = JSON.parse(raw) as OmissionToplistsArtifact;
  const journeyScoreGte = Number(process.env.SEASON1_OMISSION_JOURNEY_MIN ?? '0.6');
  const topCount = Number(process.env.SEASON1_OMISSION_TOP_N ?? '30');

  const targetOmissions = artifact.top50Omissions
    .filter((entry) => entry.journeyScore >= journeyScoreGte)
    .filter((entry) => entry.exclusionReason === 'node_score_below_quality_floor')
    .slice(0, topCount);

  const prisma = new PrismaClient();
  try {
    const moviesRaw = await prisma.movie.findMany({
      where: { id: { in: targetOmissions.map((entry) => entry.movieId) } },
      select: {
        id: true,
        tmdbId: true,
        title: true,
        year: true,
        genres: true,
        keywords: true,
        synopsis: true,
        embedding: { select: { vectorJson: true } },
      },
    });
    const movieById = new Map<string, ParsedMovie>(moviesRaw.map((movie) => [movie.id, {
      id: movie.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      genres: parseJsonStringArray(movie.genres),
      keywords: parseJsonStringArray(movie.keywords),
      synopsis: movie.synopsis,
      embedding: parseEmbedding(movie.embedding?.vectorJson),
    }]));

    const seasonId = 'season-1';
    const ontology = loadSeasonOntology(seasonId);
    const prototypePack = loadSeasonPrototypePack(seasonId, ontology.taxonomyVersion);
    const nodeSlugs = ontology.nodes.map((node) => node.slug);
    const prototypeCountByNode = new Map(prototypePack.nodes.map((node) => [node.nodeSlug, node.positivePrototypes.length] as const));

    const analyzed = targetOmissions.map((omission) => {
      const movie = movieById.get(omission.movieId);
      if (!movie) {
        return {
          ...omission,
          error: 'movie_missing_from_db',
        };
      }
      const scores = scoreMovieForNodes({
        seasonId,
        taxonomyVersion: ontology.taxonomyVersion,
        movie: {
          id: movie.id,
          tmdbId: movie.tmdbId,
          title: movie.title,
          year: movie.year,
          genres: movie.genres,
          keywords: movie.keywords,
          synopsis: movie.synopsis,
        },
        movieEmbedding: movie.embedding ?? undefined,
        nodeSlugs,
      });
      const best = scores[0]!;
      const negativeSignalsTriggered = best.evidence.weak.firedLfNames.filter((name) => name.toLowerCase().includes('negative'));
      const bucket = classifyBucket({
        weakScore: best.weakScore,
        prototypeScore: best.prototypeScore,
        negativeSignalsTriggered,
      });
      return {
        movieId: omission.movieId,
        tmdbId: omission.tmdbId,
        title: omission.title,
        year: omission.year,
        journeyScore: omission.journeyScore,
        bestNode: omission.bestNode ?? { nodeSlug: best.nodeSlug, nodeScore: best.finalScore, qualityFloor: 0 },
        bucket,
        debug: {
          bestNodeScore: {
            nodeSlug: best.nodeSlug,
            weakSupervisionScore: best.weakScore,
            prototypeSimilarityScore: best.prototypeScore,
            finalScore: best.finalScore,
            firedEvidence: best.evidence.weak.firedLfNames,
            negativeSignalsTriggered,
            prototypeCount: prototypeCountByNode.get(best.nodeSlug) ?? 0,
          },
          perNodeTop5: scores.slice(0, 5).map((row) => ({
            nodeSlug: row.nodeSlug,
            weakSupervisionScore: row.weakScore,
            prototypeSimilarityScore: row.prototypeScore,
            finalScore: row.finalScore,
            firedEvidence: row.evidence.weak.firedLfNames,
          })),
        },
      };
    });

    const bucketSummary = {
      A_missing_prototypes: analyzed.filter((row) => row.bucket === 'A_missing_prototypes').length,
      B_missing_lfs_keywords: analyzed.filter((row) => row.bucket === 'B_missing_lfs_keywords').length,
      C_negative_or_ontology_conflict: analyzed.filter((row) => row.bucket === 'C_negative_or_ontology_conflict').length,
    };

    const mustIncludeCoverage = getSeason1MustIncludeForNode('social-domestic-horror')
      .concat(getSeason1MustIncludeForNode('slasher-serial-killer'))
      .concat(getSeason1MustIncludeForNode('supernatural-horror'))
      .map((entry) => ({
        nodeSlug: entry.nodeSlug,
        title: entry.title,
        year: entry.year,
      }));

    const report = {
      generatedAt: new Date().toISOString(),
      sourceArtifact: artifactPath,
      release: artifact.snapshot.release,
      filters: {
        journeyScoreGte,
        exclusionReason: 'node_score_below_quality_floor',
        selectedCount: targetOmissions.length,
      },
      bucketSummary,
      analyzedOmissions: analyzed,
      appliedFixPlan: {
        prototypeNodesUpdated: [
          'supernatural-horror',
          'slasher-serial-killer',
          'sci-fi-horror',
          'apocalyptic-horror',
          'social-domestic-horror',
        ],
        targetedLfNodesUpdated: [
          'social-domestic-horror',
          'supernatural-horror',
          'slasher-serial-killer',
          'sci-fi-horror',
          'apocalyptic-horror',
        ],
        globalThresholdChanges: false,
      },
      mustIncludeEssentials: mustIncludeCoverage,
    };

    const outDir = resolve('artifacts/season1');
    await mkdir(outDir, { recursive: true });
    const outPath = resolve(outDir, 'omission-fix-report.json');
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      outPath,
      selectedCount: targetOmissions.length,
      bucketSummary,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('debug-season1-omission-reasons failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
