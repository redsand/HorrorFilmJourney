# Retrieval Open Decisions (Resolved)

Date: 2026-03-04 (America/Chicago)

## 1) Embedding model choice for local/offline deterministic tests
- Decision: Use `local-evidence-embedding-v1` (`computeLocalTextEmbedding`) for all deterministic/local pipelines.
- Rationale:
  - No network dependency in test runs.
  - Stable vectors across repeated runs and environments.
  - Already integrated in `backfillEvidenceChunkEmbeddings`.

## 2) ANN backend strategy in local vs production
- Decision:
  - Local/test: no ANN service required; use deterministic semantic scoring over DB-loaded chunk set.
  - Production (current phase): same deterministic semantic scoring path with top-k bounds and governance caps.
  - Future upgrade path: replace semantic scorer implementation behind retriever interface without contract changes.
- Rationale:
  - Preserves deterministic behavior and low operational complexity while corpus remains moderate.
  - Keeps hybrid contract stable for future ANN swap.

## 3) Source licensing boundary for external text ingestion
- Decision:
  - Store curated metadata and short snippets only.
  - Keep `url`, attribution (`sourceName`, `articleTitle`), and optional `license` metadata.
  - No full-text ingestion from unlicensed external sources.
  - Internal/editorial or explicitly licensed corpora may store full content in `EvidenceDocument`.
- Rationale:
  - Keeps retrieval grounded while respecting licensing constraints.
  - Aligns with current curated external reading design and deterministic corpus workflow.
