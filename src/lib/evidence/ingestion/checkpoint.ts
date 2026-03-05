import {
  computeEvidenceDocumentHash,
  type EvidenceIngestDocumentInput,
} from './chunking';

export type EvidenceIngestionCheckpoint = {
  version: 1;
  updatedAt: string;
  completed: Record<string, string>;
};

function checkpointKey(document: EvidenceIngestDocumentInput): string {
  return `${document.sourceName.trim().toLowerCase()}|${document.url.trim().toLowerCase()}`;
}

function hashDocument(document: EvidenceIngestDocumentInput): string {
  return computeEvidenceDocumentHash(document);
}

export function createEmptyEvidenceIngestionCheckpoint(): EvidenceIngestionCheckpoint {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    completed: {},
  };
}

export function markEvidenceDocumentInCheckpoint(
  checkpoint: EvidenceIngestionCheckpoint,
  document: EvidenceIngestDocumentInput,
): EvidenceIngestionCheckpoint {
  const key = checkpointKey(document);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    completed: {
      ...checkpoint.completed,
      [key]: hashDocument(document),
    },
  };
}

export function filterPendingEvidenceDocuments(
  documents: EvidenceIngestDocumentInput[],
  checkpoint: EvidenceIngestionCheckpoint,
): {
  pending: EvidenceIngestDocumentInput[];
  skipped: EvidenceIngestDocumentInput[];
} {
  const pending: EvidenceIngestDocumentInput[] = [];
  const skipped: EvidenceIngestDocumentInput[] = [];

  for (const document of documents) {
    const key = checkpointKey(document);
    const expectedHash = hashDocument(document);
    if (checkpoint.completed[key] === expectedHash) {
      skipped.push(document);
      continue;
    }
    pending.push(document);
  }

  return { pending, skipped };
}
