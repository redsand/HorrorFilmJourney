import { prisma } from '../src/lib/prisma';
import { createConfiguredEvidenceRetriever } from '../src/lib/evidence/retrieval/index';
import type { EvidencePacketVM } from '../src/lib/evidence/evidence-retriever';

type QueryFixture = {
  label: string;
  question: string;
  tmdbId: number;
  seasonSlug: string;
  packSlug: string;
};

const QUERY_FIXTURES: QueryFixture[] = [
  {
    label: 'Midnight Movies',
    question: 'What are midnight movies?',
    tmdbId: 3112, // The Night of the Hunter (Season 2 / midnight-movies)
    seasonSlug: 'season-2',
    packSlug: 'cult-classics',
  },
  {
    label: 'Suspiria Cult Case',
    question: 'Why is Suspiria a cult film?',
    tmdbId: 11906,
    seasonSlug: 'season-2',
    packSlug: 'cult-classics',
  },
  {
    label: 'Psychotronic Cinema',
    question: 'What defines psychotronic cinema?',
    tmdbId: 27813, // Basket Case (psychotronic node representative)
    seasonSlug: 'season-2',
    packSlug: 'cult-classics',
  },
];

type EvidenceDetail = {
  rank: number;
  docId?: string;
  docType: string;
  sourceName: string;
  url?: string;
  snippetPreview: string;
  sourceType: string | undefined;
};

const SNIPPET_PREVIEW_LENGTH = 80;

async function resolvePackId(packSlug: string): Promise<string> {
  const pack = await prisma.genrePack.findUnique({ where: { slug: packSlug }, select: { id: true } });
  if (!pack) {
    throw new Error(`Genre pack '${packSlug}' is missing`);
  }
  return pack.id;
}

async function resolveMovieId(tmdbId: number): Promise<{ id: string; title: string }> {
  const movie = await prisma.movie.findUnique({ where: { tmdbId }, select: { id: true, title: true } });
  if (!movie) {
    throw new Error(`Movie with tmdbId ${tmdbId} not found`);
  }
  return movie;
}

function previewSnippet(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= SNIPPET_PREVIEW_LENGTH) {
    return cleaned;
  }
  return `${cleaned.slice(0, SNIPPET_PREVIEW_LENGTH - 1)}…`;
}

async function identifyDocument(item: EvidencePacketVM): Promise<{ docId?: string; docType: string }> {
  const key = `${item.sourceName}|${item.url ?? ''}`;
  // Cache per-process to avoid repeated lookups.
  if (IDENTIFICATION_CACHE.has(key)) {
    return IDENTIFICATION_CACHE.get(key)!;
  }

  let docId: string | undefined;
  let docType = 'unknown';
  if (item.url) {
    const doc = await prisma.evidenceDocument.findFirst({
      where: {
        sourceName: item.sourceName,
        url: item.url,
      },
      select: { id: true },
    });
    if (doc) {
      docId = doc.id;
      docType = 'evidenceDocument';
    }
  }

  if (!docId) {
    const packet = await prisma.evidencePacket.findFirst({
      where: {
        sourceName: item.sourceName,
        url: item.url ?? '',
        snippet: item.snippet,
      },
      select: { id: true },
    });
    if (packet) {
      docId = packet.id;
      docType = 'evidencePacket';
    }
  }

  if (!docId && item.sourceType === 'chunk' && item.url) {
    const doc = await prisma.evidenceDocument.findFirst({
      where: { sourceName: item.sourceName, url: item.url },
      select: { id: true },
    });
    if (doc) {
      docId = doc.id;
      docType = 'evidenceDocument';
    }
  }

  const result = { docId, docType };
  IDENTIFICATION_CACHE.set(key, result);
  return result;
}

const IDENTIFICATION_CACHE = new Map<string, { docId?: string; docType: string }>();

async function collectEvidenceDetails(evidence: EvidencePacketVM[]): Promise<EvidenceDetail[]> {
  const details = await Promise.all(evidence.map(async (item, index) => {
    const rank = item.provenance?.rank ?? index + 1;
    const { docId, docType } = await identifyDocument(item);
    return {
      rank,
      docId,
      docType,
      sourceName: item.sourceName,
      url: item.url,
      snippetPreview: previewSnippet(item.snippet),
      sourceType: item.provenance?.sourceType,
    };
  }));
  return details;
}

async function run(): Promise<void> {
  const previousMode = process.env.EVIDENCE_RETRIEVAL_MODE;
  const previousRequireIndex = process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX;
  process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
  process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX = 'false';

  try {
    const retriever = createConfiguredEvidenceRetriever(prisma as never);
    for (const fixture of QUERY_FIXTURES) {
      console.log('='.repeat(80));
      console.log(`[query] ${fixture.label}`);
      console.log(` question: ${fixture.question}`);
      const packId = await resolvePackId(fixture.packSlug);
      const movie = await resolveMovieId(fixture.tmdbId);
      const runSignatures = new Set<string>();

      for (let run = 1; run <= 10; run += 1) {
        const evidence = await retriever.getEvidenceForMovie(movie.id, {
          query: fixture.question,
          seasonSlug: fixture.seasonSlug,
          packSlug: fixture.packSlug,
          packId,
          includeExternalReadings: true,
          requireSeasonContext: true,
          callerId: 'script:audit-rag-determinism',
          topK: 8,
        });
        const details = await collectEvidenceDetails(evidence);
        const signature = details.map((entry) => `${entry.rank}:${entry.docId ?? 'unknown'}:${entry.sourceName}`).join('|');
        runSignatures.add(signature);
        console.log(` run ${run} signature=${signature}`);
        for (const entry of details) {
          console.log(
            `   rank=${entry.rank} ${entry.sourceType ?? 'packet'} docId=${entry.docId ?? 'missing'} type=${entry.docType} source=${entry.sourceName}`
            + `${entry.url ? ` url=${entry.url}` : ''}`
            + ` snippet="${entry.snippetPreview}"`,
          );
        }
      }

      if (runSignatures.size === 1) {
        console.log(`[summary] ${fixture.label} produced identical ordering across all runs.`);
      } else {
        console.log(`[summary] ${fixture.label} produced ${runSignatures.size} unique order signatures across 10 runs.`);
      }
    }
  } finally {
    if (typeof previousMode === 'string') {
      process.env.EVIDENCE_RETRIEVAL_MODE = previousMode;
    } else {
      delete process.env.EVIDENCE_RETRIEVAL_MODE;
    }
    if (typeof previousRequireIndex === 'string') {
      process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX = previousRequireIndex;
    } else {
      delete process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX;
    }
  }
}

run()
  .catch((error) => {
    console.error('[audit-rag-determinism] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
