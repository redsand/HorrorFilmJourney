import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../src/lib/prisma.ts';
import {
  ingestEvidenceDocuments,
  type EvidenceIngestDocumentInput,
} from '../src/lib/evidence/ingestion/index.ts';

type IngestFileShape = {
  documents?: EvidenceIngestDocumentInput[];
};

function parseArgs(): { inputPath: string } {
  const args = process.argv.slice(2);
  const inputFlagIndex = args.findIndex((arg) => arg === '--input');
  if (inputFlagIndex < 0 || !args[inputFlagIndex + 1]) {
    throw new Error('Missing required --input <path> argument');
  }
  return { inputPath: resolve(process.cwd(), args[inputFlagIndex + 1]!) };
}

function loadDocuments(inputPath: string): EvidenceIngestDocumentInput[] {
  const raw = readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as IngestFileShape | EvidenceIngestDocumentInput[];
  const docs = Array.isArray(parsed) ? parsed : parsed.documents ?? [];
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new Error(`No ingest documents found in ${inputPath}`);
  }
  return docs;
}

async function run(): Promise<void> {
  const { inputPath } = parseArgs();
  const documents = loadDocuments(inputPath);
  const result = await ingestEvidenceDocuments(prisma, documents);

  console.log(JSON.stringify({
    ok: true,
    inputPath,
    documents: result.documentsProcessed,
    chunksWritten: result.chunksWritten,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('[ingest-evidence-corpus] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
