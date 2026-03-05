import { prisma } from '../src/lib/prisma.ts';
import { ingestEvidenceDocuments } from '../src/lib/evidence/ingestion/index.ts';
import { createConfiguredEvidenceRetriever } from '../src/lib/evidence/retrieval/index.ts';

function parseArgs(): { runs: number } {
  const args = process.argv.slice(2);
  const idx = args.findIndex((arg) => arg === '--runs');
  const raw = idx >= 0 ? args[idx + 1] : undefined;
  const parsed = raw ? Number.parseInt(raw, 10) : 25;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { runs: 25 };
  }
  return { runs: Math.min(parsed, 200) };
}

async function resolveMovie(): Promise<{ id: string; title: string }> {
  const existing = await prisma.movie.findUnique({
    where: { tmdbId: 990001 },
    select: { id: true, title: true },
  });
  if (existing) {
    return existing;
  }

  const created = await prisma.movie.create({
    data: {
      tmdbId: 990001,
      title: 'RAG Baseline Fixture Film',
      year: 1999,
      posterUrl: 'https://image.tmdb.org/t/p/w500/rag-baseline.jpg',
      genres: ['horror'],
    },
    select: { id: true, title: true },
  });
  return created;
}

async function ensurePacket(movieId: string): Promise<void> {
  await prisma.evidencePacket.deleteMany({
    where: {
      movieId,
      sourceName: 'CinemaCodex Editorial',
      url: 'https://cinemacodex.local/editorial/rag-baseline',
    },
  });
  await prisma.evidencePacket.create({
    data: {
      movieId,
      sourceName: 'CinemaCodex Editorial',
      url: 'https://cinemacodex.local/editorial/rag-baseline',
      snippet: 'Baseline reception context used to validate retrieval diagnostics and measurable goals.',
      retrievedAt: new Date(),
    },
  });
}

async function ensureDocument(movieId: string): Promise<void> {
  await ingestEvidenceDocuments(prisma, [
    {
      movieId,
      seasonSlug: 'season-1',
      sourceName: 'CinemaCodex Dossier',
      url: 'https://cinemacodex.local/dossier/rag-baseline',
      title: 'RAG Baseline Dossier',
      content: [
        'This deterministic dossier anchors retrieval quality checks.',
        'It includes production, reception, and influence context for stable hybrid retrieval.',
        'The text is long enough to produce deterministic chunks for indexing smoke validation.',
      ].join(' '),
      license: 'internal',
    },
  ]);
}

async function generateRuns(movieId: string, runs: number): Promise<void> {
  const previousMode = process.env.EVIDENCE_RETRIEVAL_MODE;
  const previousRequireIndex = process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX;
  process.env.EVIDENCE_RETRIEVAL_MODE = 'hybrid';
  process.env.EVIDENCE_RETRIEVAL_REQUIRE_INDEX = 'false';
  try {
    const retriever = createConfiguredEvidenceRetriever(prisma);
    for (let i = 0; i < runs; i += 1) {
      // Generate repeated hybrid retrieval events for measurable diagnostics.
      // eslint-disable-next-line no-await-in-loop
      await retriever.getEvidenceForMovie(movieId, {
        seasonSlug: 'season-1',
        query: `rag baseline quality check ${i + 1}`,
        topK: 5,
      });
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

async function run(): Promise<void> {
  const { runs } = parseArgs();
  const movie = await resolveMovie();
  await ensurePacket(movie.id);
  await ensureDocument(movie.id);
  await generateRuns(movie.id, runs);

  console.log(JSON.stringify({
    ok: true,
    movieId: movie.id,
    movieTitle: movie.title,
    retrievalRunsGenerated: runs,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('[bootstrap-rag-value-baseline] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
