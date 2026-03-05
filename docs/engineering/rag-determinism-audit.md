# RAG Determinism Audit

## Setup & instrumentation
- Seeded targeted evidence for the audit nodes so each query has at least one deterministic chunk (`scripts/seed-rag-audit-fixtures.ts`).
- Forced hybrid retrieval inside the audit script (`scripts/audit-rag-determinism.ts`) by setting `EVIDENCE_RETRIEVAL_MODE=hybrid` and `EVIDENCE_RETRIEVAL_REQUIRE_INDEX=false` before calling `createConfiguredEvidenceRetriever`.
- Each query was executed 10 times with `includeExternalReadings=true`, `topK=8`, and the Season 2 pack context so the hybrid path exercised lexical + semantic scoring plus governance filtering.

## Query outputs (doc IDs + chunk order)
All runs returned a single chunk (rank 1) for the seeded document, so chunk ordering stayed stable. The document IDs `cmmd03ndv0001vn3dcfcqjfvo`, `cmmd03ne80003vn3d3sykaah2`, and `cmmd03nec0005vn3d7ignsc43` map to the three seeded sources.

| Query | Document | Doc ID | Rank | Source | URL | Snippet preview |
| --- | --- | --- | --- | --- | --- | --- |
| What are midnight movies? | CinemaCodex Audit (Midnight Movies) | `cmmd03ndv0001vn3dcfcqjfvo` | 1 (chunk) | chunk | `https://cinemacodex.local/audit/midnight-movies` | "Midnight movies are the cult showings that over-index on surreal pacing, taboo…" |
| Why is Suspiria a cult film? | CinemaCodex Audit (Suspiria) | `cmmd03ne80003vn3d3sykaah2` | 1 (chunk) | chunk | `https://cinemacodex.local/audit/suspiria-cult` | "Suspiria is a cult film because it rewrites standard horror grammar with operat…" |
| What defines psychotronic cinema? | CinemaCodex Audit (Psychotronic) | `cmmd03nec0005vn3d7ignsc43` | 1 (chunk) | chunk | `https://cinemacodex.local/audit/psychotronic-cinema` | "Psychotronic cinema is defined by its so-bad-it’s-good energy, cheap special ef…" |

## Variation check
- Run signatures recorded by `scripts/audit-rag-determinism.ts` were:
  - Midnight Movies: `1:cmmd03ndv0001vn3dcfcqjfvo:CinemaCodex Audit (Midnight Movies)`
  - Suspiria Cult Case: `1:cmmd03ne80003vn3d3sykaah2:CinemaCodex Audit (Suspiria)`
  - Psychotronic Cinema: `1:cmmd03nec0005vn3d7ignsc43:CinemaCodex Audit (Psychotronic)`
- Each signature repeated for all 10 runs, so no evidence ordering or reranking variation was observed.

## Risk analysis (potential nondeterministic sources)
1. **Fusion reranker tie-breakers** – `reciprocalRankFusion` in `src/lib/evidence/retrieval/fusion-reranker.ts` combines lexical and semantic ranks but the downstream governance sort (`src/lib/evidence/retrieval/governance.ts:32-50`) only orders by `fusedScore`. Equal fused scores currently fall back to JavaScript’s default sort stability, which can flip when the sorter runs on different Node versions or when candidates share identical lexical/semantic ranks. Add a deterministic tie-break (e.g., compare `rankLexical`, `rankSemantic`, then `documentId`) before applying governance filters.
2. **Chunk retrieval ordering** – `prisma.evidenceChunk.findMany` in `HybridEvidenceRetriever.retrieveWithStats` (`src/lib/evidence/retrieval/index.ts:110-135`) only sorts by `updatedAt`. Edited documents often have the same timestamp, so the implicit order is not guaranteed when multiple chunks score equally. Including `chunkIndex` (or `documentId`) in the `orderBy` clause keeps the lexical upstream order stable.
3. **Embedding similarity drift** – the semantic scorer (`src/lib/evidence/retrieval/semantic-retriever.ts`) relies on stored chunk embeddings, so rerunning embedding refresh jobs or ingesting new chunks with different chunk boundaries can change cosine scores. Anchor the embedding model version (`LOCAL_EVIDENCE_EMBEDDING_MODEL`) and snapshot the `chunkIndex` order so the same set of embeddings is reused for deterministic runs.
4. **Metadata filters** – the hybrid retriever only applies season filtering when `query.seasonSlug` is provided. Any code path that omits the `seasonSlug` (or uses the wrong season) risks mixing evidence across seasons and the resulting scorer may oscillate depending on which evidence documents are available. Guard the companion/recommendation paths to always pass the user’s resolved pack/season context.

## Recommendations & minimal fixes
1. Add explicit tie-break logic before governance sorting (compare `rankLexical`, `rankSemantic`, then `documentId`) and document that pairwise fused score collisions are resolved deterministically. `src/lib/evidence/retrieval/governance.ts` is the right place to insert this change and can be validated by `scripts/audit-rag-determinism.ts` once more candidates are seeded.
2. Order chunk retrieval by `[{ updatedAt: 'desc' }, { chunkIndex: 'asc' }]` (and include `documentId` if needed) so lexical scoring always sees a consistent chunk order even when timestamps are identical. This requires touching `src/lib/evidence/retrieval/index.ts` around the `evidenceChunk.findMany` call.
3. Keep embedding metadata frozen per release (lock `LOCAL_EVIDENCE_EMBEDDING_MODEL` and release-specific vector snapshots) so rerunning the semantic retriever in tests or CI does not recompute slightly different scores. Mention this constraint in the retrieval runbook (`docs/full-retrieval-pipeline-tracker.md`).
4. Ensure every caller of `EvidenceRetriever` sets `seasonSlug` and `packId` (companion, recommendations, admin tools). Register a regression test that instantiates the retriever without the season context and asserts that `includeExternalReadings` remains `false` or fails fast.

## Supporting scripts
- `scripts/seed-rag-audit-fixtures.ts` seeds the three deterministic documents referenced above.
- `scripts/audit-rag-determinism.ts` drives the 10× query runs, records document IDs/chunk order, and prints run signatures for regression checks.

