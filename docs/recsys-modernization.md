# Recommendation System Modernization Roadmap

## Phase 1 (now): architecture seams + JSON vectors on SQLite

This phase introduces a forward-compatible `ModernRecSys` layer without changing recommendation outcomes:

- Interface seams for `CandidateGenerator`, `Reranker`, `ExplorationPolicy`, `EvidenceRetriever`, and `NarrativeComposer`.
- V1 adapters that preserve current logic and outputs.
- `REC_ENGINE_MODE` feature flag:
  - `v1` uses the legacy direct pipeline.
  - `modern` uses the composed interface pipeline backed by v1 adapters.
- SQLite storage additions:
  - `MovieEmbedding` with `vectorJson` for temporary float vector storage.
  - `UserEmbeddingSnapshot` with time-series snapshots.
  - `EvidencePacket` cache table for RAG evidence snippets.
  - `RecommendationDiagnostics` for candidate filtering and exploration metrics.

### Modern diagnostics (current behavior)

When `REC_ENGINE_MODE=modern`, each generated recommendation batch writes one `RecommendationDiagnostics` row keyed by `batchId` with:

- `candidateCount`
- `excludedSeenCount`
- `excludedSkippedRecentCount`
- `explorationUsed`
- `diversityStats` (JSON)

Diagnostics are exposed through admin-only endpoint:

- `GET /api/recommendations/[batchId]/diagnostics`

Near-term use: operational visibility (candidate pool health, filter pressure, exploration usage).
Later phases can use the same data for offline policy replay, ranking audits, and experiment attribution.

## Phase 2: Postgres + pgvector transition

- Move from SQLite to Postgres.
- Migrate `vectorJson` storage to native `vector` type (`pgvector`).
- Add ANN indexes (HNSW / IVF depending on production constraints).
- Keep interface contracts stable; storage implementation changes are internal.

## Phase 3: embedding jobs + refresh cadence

- Nightly batch process computes movie embeddings and refreshes stale rows.
- On-demand user embedding snapshots are created after sufficient interactions.
- Keep historical snapshots to support longitudinal taste drift analysis.

## Phase 4: sequential reranker

- Add reranker features beyond static diversity:
  - interaction recency,
  - sequence transitions (what the user watched immediately before/after),
  - fatigue and novelty features.
- Integrate as a drop-in replacement of `Reranker`.

## Phase 5: contextual bandit exploration (1-of-5)

- Introduce exploration budget policy: one stretch pick in the top-5 slate.
- Implement contextual bandit strategy (e.g., LinUCB/Thompson variants) keyed by user state.
- Persist policy decisions and outcomes for offline replay and policy improvement.

## Phase 6: RAG evidence retriever + citation-ready UI payloads

- Expand evidence retrieval from cache-only to active retrieval pipelines.
- Ingest reception history, streaming availability, and publication snippets.
- Surface evidence packets as citation-ready narrative attachments for the LLM composer.
- Ensure recommendation cards can display source-attributed citations in the UI.
