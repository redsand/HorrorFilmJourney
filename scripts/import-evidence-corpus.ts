import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

type ImportChunk = {
  id: string;
  chunkIndex: number;
  text: string;
  charCount: number;
  embeddingVector: number[] | null;
  embeddingModel: string | null;
  embeddingDim: number | null;
};

type ImportDocument = {
  movieTmdbId: number;
  seasonSlug: string | null;
  sourceName: string;
  url: string;
  title: string;
  content: string;
  contentHash: string;
  publishedAt: string | null;
  license: string | null;
  chunks: ImportChunk[];
};

type ImportPayload = {
  generatedAt: string;
  season: string | null;
  documentCount: number;
  chunkCount: number;
  documents: ImportDocument[];
};

type CliOptions = {
  input: string;
};

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const inputIndex = args.findIndex((arg) => arg === "--input");
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error("Missing required --input <path-to-evidence-corpus.json>");
  }
  return { input: args[inputIndex + 1]! };
}

function isValidPayload(value: unknown): value is ImportPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ImportPayload>;
  return Boolean(
    typeof payload.generatedAt === "string" &&
    Array.isArray(payload.documents)
  );
}

async function main(): Promise<void> {
  const cli = parseCli();
  const raw = await readFile(resolve(cli.input), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isValidPayload(parsed)) {
    throw new Error("Invalid evidence corpus payload");
  }

  const prisma = new PrismaClient();
  try {
    const tmdbIds = [...new Set(parsed.documents.map((d) => d.movieTmdbId))];
    const movies = await prisma.movie.findMany({
      where: { tmdbId: { in: tmdbIds } },
      select: { id: true, tmdbId: true },
    });
    const movieIdByTmdb = new Map(movies.map((m) => [m.tmdbId, m.id]));

    console.log(`Starting import of ${parsed.documents.length} documents for ${tmdbIds.length} movies...`);

    let docCount = 0;
    let chunkCount = 0;

    for (const doc of parsed.documents) {
      const movieId = movieIdByTmdb.get(doc.movieTmdbId);
      if (!movieId) {
        continue;
      }

      const upserted = await prisma.evidenceDocument.upsert({
        where: { sourceName_url_seasonSlug: { sourceName: doc.sourceName, url: doc.url, seasonSlug: doc.seasonSlug ?? null } },
        create: {
          movieId,
          seasonSlug: doc.seasonSlug,
          sourceName: doc.sourceName,
          url: doc.url,
          title: doc.title,
          content: doc.content,
          contentHash: doc.contentHash,
          publishedAt: doc.publishedAt ? new Date(doc.publishedAt) : null,
          license: doc.license,
        },
        update: {
          movieId,
          title: doc.title,
          content: doc.content,
          contentHash: doc.contentHash,
          publishedAt: doc.publishedAt ? new Date(doc.publishedAt) : null,
          license: doc.license,
        },
      });

      await prisma.evidenceChunk.deleteMany({ where: { documentId: upserted.id } });

      if (doc.chunks.length > 0) {
        await prisma.evidenceChunk.createMany({
          data: doc.chunks.map((c) => ({
            id: c.id,
            documentId: upserted.id,
            chunkIndex: c.chunkIndex,
            text: c.text,
            charCount: c.charCount,
            embeddingModel: c.embeddingModel,
            embeddingDim: c.embeddingDim,
            embeddingVector: c.embeddingVector as any,
          })),
        });
        chunkCount += doc.chunks.length;
      }
      docCount++;
    }

    console.log(`Import complete: ${docCount} documents, ${chunkCount} chunks.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Evidence corpus import failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
