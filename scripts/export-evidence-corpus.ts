import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

type CliOptions = {
  season?: string;
  output?: string;
};

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const seasonIndex = args.findIndex((arg) => arg === "--season");
  const season = seasonIndex !== -1 ? args[seasonIndex + 1] : undefined;
  const outputIndex = args.findIndex((arg) => arg === "--output");
  const output = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
  return { season, output };
}

type ExportDocument = {
  movieTmdbId: number;
  seasonSlug: string | null;
  sourceName: string;
  url: string;
  title: string;
  content: string;
  contentHash: string;
  publishedAt: string | null;
  license: string | null;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    text: string;
    charCount: number;
    embeddingVector: number[] | null;
    embeddingModel: string | null;
    embeddingDim: number | null;
  }>;
};

type ExportPayload = {
  generatedAt: string;
  season: string | null;
  documentCount: number;
  chunkCount: number;
  documents: ExportDocument[];
};

async function main(): Promise<void> {
  const cli = parseCli();
  const prisma = new PrismaClient();

  try {
    const whereClause = cli.season ? { seasonSlug: cli.season } : {};

    const documents = await prisma.evidenceDocument.findMany({
      where: whereClause,
      select: {
        movie: { select: { tmdbId: true } },
        seasonSlug: true,
        sourceName: true,
        url: true,
        title: true,
        content: true,
        contentHash: true,
        publishedAt: true,
        license: true,
        chunks: {
          orderBy: { chunkIndex: "asc" },
          select: {
            id: true,
            chunkIndex: true,
            text: true,
            charCount: true,
            embeddingVector: true,
            embeddingModel: true,
            embeddingDim: true,
          },
        },
      },
      orderBy: [{ seasonSlug: "asc" }, { title: "asc" }],
    });

    const payload: ExportPayload = {
      generatedAt: new Date().toISOString(),
      season: cli.season ?? null,
      documentCount: documents.length,
      chunkCount: documents.reduce((acc, doc) => acc + doc.chunks.length, 0),
      documents: documents.map((doc) => ({
        movieTmdbId: doc.movie.tmdbId,
        seasonSlug: doc.seasonSlug,
        sourceName: doc.sourceName,
        url: doc.url,
        title: doc.title,
        content: doc.content,
        contentHash: doc.contentHash,
        publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
        license: doc.license,
        chunks: doc.chunks.map((chunk) => ({
          id: chunk.id,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          charCount: chunk.charCount,
          embeddingVector: chunk.embeddingVector,
          embeddingModel: chunk.embeddingModel,
          embeddingDim: chunk.embeddingDim,
        })),
      })),
    };

    const outDir = resolve("backups");
    await mkdir(outDir, { recursive: true });
    const seasonSlug = cli.season ?? "all";
    const outPath = cli.output || resolve(outDir, `evidence-corpus-${seasonSlug}-${timestamp()}.json`);
    await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");

    console.log(`Evidence corpus export complete: ${outPath}`);
    console.log(`Summary: season=${cli.season ?? "all"} documents=${payload.documentCount} chunks=${payload.chunkCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Evidence corpus export failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
