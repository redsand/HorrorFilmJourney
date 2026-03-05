import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  computeSeasonPackScore,
  loadSeason3ClassifierArtifact,
  parseCastNames,
  parseJsonStringArray,
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

async function resolveDefaultInputPath(): Promise<string> {
  const shortlist = path.resolve('docs/season/season-3-sci-fi-candidates-shortlist.json');
  try {
    await fs.access(shortlist);
    return shortlist;
  } catch {
    return path.resolve('docs/season/season-3-sci-fi-candidates-calibrated.json');
  }
}

async function resolvePaths() {
  const inputPath = path.resolve(parseArg('--input') ?? await resolveDefaultInputPath());
  const artifactPath = path.resolve(
    parseArg('--artifact')
    ?? process.env.SEASON3_CLASSIFIER_ARTIFACT_PATH
    ?? 'artifacts/season3-node-classifier/season-3-sci-fi-v1/model.json',
  );
  const outputPath = path.resolve(parseArg('--output') ?? 'docs/season/season-3-sci-fi-candidates-scored.json');
  return { inputPath, artifactPath, outputPath };
}

function toClassifierInput(candidate: HarvestCandidate, dbMovie?: {
  tmdbId: number;
  genres: Prisma.JsonValue | null;
  keywords: Prisma.JsonValue | null;
  synopsis: string | null;
  country: string | null;
  director: string | null;
  castTop: Prisma.JsonValue | null;
  embedding: { vectorJson: Prisma.JsonValue } | null;
}): ClassifierMovieInput {
  const embeddedVector = Array.isArray(dbMovie?.embedding?.vectorJson)
    ? dbMovie!.embedding!.vectorJson.filter((value): value is number => typeof value === 'number')
    : undefined;
  const genres = dbMovie ? parseJsonStringArray(dbMovie.genres) : (candidate.genreIds ?? []).map((id) => `genre-${id}`);
  const keywords = dbMovie ? parseJsonStringArray(dbMovie.keywords) : (candidate.discoveryReasons ?? []);
  const cast = dbMovie ? parseCastNames(dbMovie.castTop) : [];

  return {
    id: String(candidate.tmdbId),
    tmdbId: candidate.tmdbId,
    title: candidate.title,
    year: candidate.year ?? null,
    genres,
    synopsis: dbMovie?.synopsis ?? candidate.overview ?? null,
    keywords,
    country: dbMovie?.country ?? null,
    director: dbMovie?.director ?? null,
    cast,
    embeddingVector: embeddedVector,
  };
}

async function main(): Promise<void> {
  const { inputPath, artifactPath, outputPath } = await resolvePaths();
  const artifact = await loadSeason3ClassifierArtifact(artifactPath);
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as HarvestFile;
  const candidates = parsed.candidates ?? [];
  const prisma = new PrismaClient();

  try {
    const tmdbIds = [...new Set(candidates.map((candidate) => candidate.tmdbId).filter((id) => Number.isInteger(id)))];
    const dbMovies = await prisma.movie.findMany({
      where: { tmdbId: { in: tmdbIds } },
      select: {
        tmdbId: true,
        genres: true,
        keywords: true,
        synopsis: true,
        country: true,
        director: true,
        castTop: true,
        embedding: { select: { vectorJson: true } },
      },
    });
    const dbByTmdbId = new Map(dbMovies.map((movie) => [movie.tmdbId, movie] as const));

    const scored = candidates
      .map((candidate) => {
        const movie = toClassifierInput(candidate, dbByTmdbId.get(candidate.tmdbId));
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
      dbCoverage: dbMovies.length,
      candidates: scored,
    }, null, 2)}\n`, 'utf8');

    console.log(`[score-season3-sci-fi-candidates] wrote ${outputPath}`);
    console.log(`[score-season3-sci-fi-candidates] count=${scored.length} dbCoverage=${dbMovies.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[score-season3-sci-fi-candidates] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
