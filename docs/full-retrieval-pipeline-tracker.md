# Full Retrieval Pipeline Tracker (Season 1 / Recommendation + Companion)

Status: IN PROGRESS
Owner: ML/Data Engineering
Last Updated: 2026-03-03 (America/Chicago)

## 1) Purpose
This document is the single source of truth for implementing and tracking the full RAG retrieval pipeline in CinemaCodex.
It is written for direct handoff to any engineer/LLM so work can continue without rediscovery.

Primary goal:
- Move from cache-only evidence retrieval to a full hybrid retrieval pipeline (lexical + semantic + governance) with deterministic fallbacks.

Non-goals:
- Do not break Season 2 behavior.
- Do not remove current deterministic fallback behavior.

## 2) Current State (As-Is)

### 2.1 What is live now
- Recommendation engine uses `CachedEvidenceRetrieverV1` reading from `EvidencePacket` only.
  - File: `src/lib/recommendation/recommendation-engine.ts`
- Companion endpoint reads `evidencePacket.findMany(...)` directly.
  - File: `src/app/api/companion/route.ts`
- Narrative composer supports evidence-grounding and citation validation/fallback.
  - File: `docs/ai.md`

### 2.2 What is missing
- No active corpus ingestion + chunking + indexing pipeline for retrieval.
- No hybrid retriever (BM25/lexical + embedding ANN fusion) in production path.
- No retrieval calibration/governance layer (source trust/freshness/diversity) as first-class module.
- No retrieval diagnostics table/metrics gate in CI.

## 3) Architecture Target (To-Be)

### 3.1 Retrieval flow
1. Ingest approved sources -> normalize -> dedupe.
2. Chunk documents and attach metadata (`movieId`, season, node, source, publishedAt, license flags).
3. Generate embeddings for chunks and build semantic index.
4. On query:
   - lexical retrieval
   - semantic retrieval
   - metadata filtering
   - fusion rerank
   - governance constraints (source caps, freshness, dedupe, trust weights)
5. Return top-k evidence with stable citation ids.
6. Persist selected evidence and retrieval diagnostics for traceability.

### 3.2 Serving guarantees
- Deterministic fallback to cache-only retrieval if index/model unavailable.
- No runtime scraping/network in tests.
- Citation references are validated before LLM output is accepted.

## 4) Phase Plan + Progress

Legend:
- [ ] not started
- [~] in progress
- [x] done

### Phase A: Contracts and Gates
- [ ] Define `EvidenceRetrieverV2` contract (query, filters, topK, provenance, scores).
- [ ] Define quality gates and thresholds (`recall@k`, citation-valid-rate, empty-hit-rate, duplicate-rate, p95 latency).
- [ ] Add response contract for retrieval provenance in recommendation/companion payloads.

Exit criteria:
- Contract docs + interface compile + baseline tests added.

### Phase B: Data Model and Migration
- [ ] Add corpus/chunk tables (movie-linked) + embedding metadata.
- [ ] Add retrieval run + diagnostics persistence model.
- [ ] Migration + Prisma generate/deploy verified.

Exit criteria:
- New schema migrates cleanly in local + test DB.

### Phase C: Ingestion/Indexing Jobs
- [ ] Build deterministic ingest adapters for approved local/curated sources.
- [ ] Normalize + dedupe pipeline.
- [ ] Chunking module with deterministic chunk IDs.
- [ ] Embedding write path + index refresh job.
- [ ] Idempotent run checkpoints and resume support.

Exit criteria:
- Re-running jobs yields stable outputs with same inputs.

### Phase D: Hybrid Retrieval
- [ ] Implement lexical retriever.
- [ ] Implement semantic retriever.
- [ ] Implement fusion/rerank + metadata filters.
- [ ] Implement governance layer (trust/freshness/diversity/source caps).
- [ ] Add deterministic fallback mode.

Exit criteria:
- Retrieval returns stable top-k for fixed fixture + passes quality gates.

### Phase E: Runtime Integration
- [ ] Wire `generateRecommendationBatchModern` to retriever V2.
- [ ] Wire companion endpoint to retriever V2.
- [ ] Keep feature flags:
  - `EVIDENCE_RETRIEVAL_MODE=cache|hybrid`
  - `EVIDENCE_RETRIEVAL_REQUIRE_INDEX=true|false`

Exit criteria:
- End-to-end retrieval is used in hybrid mode; cache mode still works.

### Phase F: CI + Observability
- [ ] Add deterministic retrieval fixtures + regression tests.
- [ ] Add diagnostics/metrics emission and admin visibility.
- [ ] Add CI gates for overlap/citation/retrieval health.

Exit criteria:
- CI blocks regressions, metrics emitted consistently.

### Phase G: Rollout
- [ ] Shadow mode validation.
- [ ] Progressive rollout (10% -> 50% -> 100%).
- [ ] Rollback script and operator runbook.

Exit criteria:
- Production stable at 100% with no quality regressions.

## 5) Task Backlog (Granular)

### Immediate Sprint (next implementation slice)
- [ ] Add retrieval schema models and migration.
- [ ] Create `src/lib/evidence/retrieval/` module scaffold:
  - [ ] `types.ts`
  - [ ] `lexical-retriever.ts`
  - [ ] `semantic-retriever.ts`
  - [ ] `fusion-reranker.ts`
  - [ ] `governance.ts`
  - [ ] `index.ts`
- [ ] Implement `EvidenceRetrieverV2` adapter with fallback to existing cache retriever.
- [ ] Add feature-flag wiring in recommendation engine + companion route.
- [ ] Add first deterministic fixture tests.

### Secondary Sprint
- [ ] Build ingestion + chunking scripts in `scripts/`.
- [ ] Add offline eval command for retrieval quality.
- [ ] Add admin debug endpoint for retrieval traces.

## 6) Acceptance Criteria (Definition of Done)

Functional:
- Hybrid retrieval can be enabled by flag and returns evidence for recommendations + companion.
- Citation payload is stable and references valid evidence IDs.
- Fallback path functions when hybrid retrieval is disabled or unavailable.

Quality:
- Deterministic tests pass in CI with no network.
- Retrieval quality gates pass on fixed fixtures.
- No material increase in recommendation request failure rate.

Operational:
- Diagnostics include retrieval stage counts, latency, and source mix.
- Runbook supports publish/rollback of retrieval mode.

## 7) Known Constraints
- Deterministic behavior required for tests.
- No live scraping in test suite.
- Season 1 only for curriculum/node governance behavior changes.
- Keep existing recommendation path stable while integrating retriever V2.

## 8) Existing Related Work (already completed)
- Weak supervision node assignment pipeline and provenance fields added.
- Season 1 node governance + taxonomy versioning + release locking added.
- Published snapshot read path is integrated for Season 1 recommendations.

Related files:
- `scripts/seed-season1-horror-subgenres.ts`
- `scripts/audit-season1-node-population.ts`
- `src/lib/nodes/governance/*`
- `src/lib/recommendation/recommendation-engine.ts`

## 9) Commands (Operator/Dev)

Setup:
```bash
npm run prisma:generate
npx prisma migrate deploy
```

Season 1 node pipeline:
```bash
node --experimental-strip-types scripts/seed-season1-horror-subgenres.ts
node --experimental-strip-types scripts/publish-season1-node-release.ts
node --experimental-strip-types scripts/audit-season1-node-population.ts
```

Tests (current relevant):
```bash
npx vitest run tests/prisma/season1-node-governance-controls.test.ts
npx vitest run tests/prisma/season1-published-snapshot-read.test.ts
npx vitest run tests/prisma/season1-weak-supervision-fixture.test.ts
```

## 10) Handoff Checklist (for next engineer/LLM)
- [ ] Read this tracker fully.
- [ ] Confirm branch/worktree state (`git status --short`).
- [ ] Run baseline tests listed above.
- [ ] Start Phase A + B before coding retrieval logic.
- [ ] Keep updates in this tracker under Change Log.

## 11) Risks and Mitigations
- Risk: Retrieval quality degrades narrative grounding.
  - Mitigation: fixture-based regression + citation validity gate.
- Risk: Latency spikes with hybrid retrieval.
  - Mitigation: top-k caps, cache, early cutoff, fallback mode.
- Risk: Source drift / stale evidence.
  - Mitigation: freshness weighting + scheduled reindex jobs.
- Risk: Non-determinism in CI.
  - Mitigation: mock embedding provider and fixed fixtures.

## 12) Open Decisions
- [ ] Embedding model choice for local/offline deterministic tests.
- [ ] ANN backend strategy in local vs production.
- [ ] Source licensing boundary for external text ingestion.

## 13) Change Log
- 2026-03-03: Tracker created; initial phased plan and acceptance criteria defined.

