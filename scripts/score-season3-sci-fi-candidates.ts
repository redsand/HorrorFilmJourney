import fs from 'node:fs/promises';
import path from 'node:path';
import {
  computeSeasonPackScore,
  loadSeason3ClassifierArtifact,
  scoreMovieWithSeason3Classifier,
  type ClassifierMovieInput,
} from '../src/lib/nodes/classifier/index.ts';

type HarvestCandidate = {
  tmdbId: number;
  title: string;
  year: number | null;
  overview?: string | null;
  discoveryReasons?: string[];
  genreIds?: number[];
};

type HarvestFile = {
  candidates?: HarvestCandidate[];
};

function parseArg(name: string): string | null {
  const args = process.argv.slice(2);
  const idx = args.findIndex((arg) => arg === name);
  return idx >= 0 ? args[idx + 1] ?? null : null;
}

function resolvePaths() {
  const inputPath = path.resolve(parseArg('--input') ?? 'docs/season/season-3-sci-fi-candidates-shortlist.json');
  const artifactPath = path.resolve(
    parseArg('--artifact')
    ?? process.env.SEASON3_CLASSIFIER_ARTIFACT_PATH
    ?? 'artifacts/season3-node-classifier/season-3-sci-fi-v1/model.json',
  );
  const outputPath = path.resolve(parseArg('--output') ?? 'docs/season/season-3-sci-fi-candidates-scored.json');
  return { inputPath, artifactPath, outputPath };
}

function toClassifierInput(candidate: HarvestCandidate): ClassifierMovieInput {
  const genreHints = (candidate.genreIds ?? []).map((id) => `genre-${id}`);
  return {
    id: String(candidate.tmdbId),
    tmdbId: candidate.tmdbId,
    title: candidate.title,
    year: candidate.year ?? null,
    genres: genreHints,
    synopsis: candidate.overview ?? null,
    keywords: candidate.discoveryReasons ?? [],
    country: null,
    director: null,
    cast: [],
  };
}

async function main(): Promise<void> {
  const { inputPath, artifactPath, outputPath } = resolvePaths();
  const artifact = await loadSeason3ClassifierArtifact(artifactPath);
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as HarvestFile;
  const candidates = parsed.candidates ?? [];

  const scored = candidates
    .map((candidate) => {
      const movie = toClassifierInput(candidate);
      const probabilities = scoreMovieWithSeason3Classifier(artifact, movie);
      const sciFiScore = computeSeasonPackScore(probabilities);
      return {
        ...candidate,
        sciFiScore,
        topNodes: probabilities.slice(0, 3),
      };
    })
    .sort((a, b) => b.sciFiScore - a.sciFiScore || a.title.localeCompare(b.title));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    seasonSlug: artifact.seasonSlug,
    packSlug: artifact.packSlug,
    taxonomyVersion: artifact.taxonomyVersion,
    artifactPath,
    inputPath,
    count: scored.length,
    candidates: scored,
  }, null, 2)}\n`, 'utf8');

  console.log(`[score-season3-sci-fi-candidates] wrote ${outputPath}`);
  console.log(`[score-season3-sci-fi-candidates] count=${scored.length}`);
}

void main().catch((error) => {
  console.error('[score-season3-sci-fi-candidates] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

