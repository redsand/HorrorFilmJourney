import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { prisma } from '../src/lib/prisma.ts';
import {
  createEmptyEvidenceIngestionCheckpoint,
  filterPendingEvidenceDocuments,
  ingestEvidenceDocuments,
  markEvidenceDocumentInCheckpoint,
  normalizeAndDedupeEvidenceDocuments,
  type EvidenceIngestDocumentInput,
  type EvidenceIngestionCheckpoint,
} from '../src/lib/evidence/ingestion/index.ts';

type IngestFileShape = {
  documents?: EvidenceIngestDocumentInput[];
};

function parseArgs(): { inputPath: string; checkpointPath?: string; resume: boolean } {
  const args = process.argv.slice(2);
  const inputFlagIndex = args.findIndex((arg) => arg === '--input');
  if (inputFlagIndex < 0 || !args[inputFlagIndex + 1]) {
    throw new Error('Missing required --input <path> argument');
  }
  const checkpointFlagIndex = args.findIndex((arg) => arg === '--checkpoint');
  const checkpointPath = checkpointFlagIndex >= 0 && args[checkpointFlagIndex + 1]
    ? resolve(process.cwd(), args[checkpointFlagIndex + 1]!)
    : undefined;
  return {
    inputPath: resolve(process.cwd(), args[inputFlagIndex + 1]!),
    checkpointPath,
    resume: args.includes('--resume'),
  };
}

function loadDocuments(inputPath: string): EvidenceIngestDocumentInput[] {
  const raw = readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as IngestFileShape | EvidenceIngestDocumentInput[];
  const docs = Array.isArray(parsed) ? parsed : parsed.documents ?? [];
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new Error(`No ingest documents found in ${inputPath}`);
  }
  const normalized = normalizeAndDedupeEvidenceDocuments(docs);
  if (normalized.length === 0) {
    throw new Error(`No valid ingest documents found in ${inputPath}`);
  }
  return normalized;
}

function loadCheckpoint(checkpointPath: string): EvidenceIngestionCheckpoint {
  if (!existsSync(checkpointPath)) {
    return createEmptyEvidenceIngestionCheckpoint();
  }

  const raw = readFileSync(checkpointPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<EvidenceIngestionCheckpoint>;
  return {
    version: 1,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    completed: parsed.completed && typeof parsed.completed === 'object'
      ? parsed.completed as Record<string, string>
      : {},
  };
}

function writeCheckpoint(checkpointPath: string, checkpoint: EvidenceIngestionCheckpoint): void {
  mkdirSync(dirname(checkpointPath), { recursive: true });
  writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

async function run(): Promise<void> {
  const { inputPath, checkpointPath, resume } = parseArgs();
  const documents = loadDocuments(inputPath);

  let checkpoint = checkpointPath ? loadCheckpoint(checkpointPath) : createEmptyEvidenceIngestionCheckpoint();
  const { pending, skipped } = resume
    ? filterPendingEvidenceDocuments(documents, checkpoint)
    : { pending: documents, skipped: [] as EvidenceIngestDocumentInput[] };

  let documentsProcessed = 0;
  let chunksWritten = 0;
  for (const document of pending) {
    // Process one-at-a-time so checkpoint writes can resume safely after interruption.
    const result = await ingestEvidenceDocuments(prisma, [document]);
    documentsProcessed += result.documentsProcessed;
    chunksWritten += result.chunksWritten;
    if (checkpointPath) {
      checkpoint = markEvidenceDocumentInCheckpoint(checkpoint, document);
      writeCheckpoint(checkpointPath, checkpoint);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    inputPath,
    ...(checkpointPath ? { checkpointPath } : {}),
    ...(resume ? { resumed: true } : {}),
    skipped: skipped.length,
    documents: documentsProcessed,
    chunksWritten,
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
