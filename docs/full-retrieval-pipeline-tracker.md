# Full Retrieval Pipeline Tracker (Season 1 / Recommendation + Companion)

Status: COMPLETE
Owner: ML/Data Engineering
Last Updated: 2026-03-04 (America/Chicago)

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
- Recommendation + companion use configured retriever modes (`cache|hybrid|shadow`) with deterministic fallback.
  - Files: `src/lib/evidence/retrieval/index.ts`, `src/lib/recommendation/recommendation-engine.ts`, `src/app/api/companion/route.ts`
- Retrieval diagnostics persist quality signals and support admin visibility + gate checks.
  - Files: `src/app/api/admin/retrieval/route.ts`, `scripts/check-retrieval-gates.ts`
- Evidence corpus ingestion supports normalization, dedupe, chunking, checkpoint resume, embedding backfill, and index refresh.
  - Files: `src/lib/evidence/ingestion/*`, `scripts/ingest-evidence-corpus.ts`, `scripts/backfill-evidence-chunk-embeddings.ts`, `scripts/refresh-evidence-index.ts`
- Rollout controls and measurable completion gates are in place.
  - Files: `scripts/retrieval-rollout.ts`, `scripts/assess-retrieval-rollout.ts`, `scripts/measure-rag-value.ts`, `scripts/generate-rag-completion-report.ts`

### 2.2 What is missing
- No critical scoped gaps remain for the retrieval plan in this document.

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
- [x] Define `EvidenceRetrieverV2` contract (query, filters, topK, provenance, scores).
- [x] Define quality gates and thresholds (`recall@k`, citation-valid-rate, empty-hit-rate, duplicate-rate, p95 latency).
- [x] Add response contract for retrieval provenance in recommendation/companion payloads.

Exit criteria:
- Contract docs + interface compile + baseline tests added.

### Phase B: Data Model and Migration
- [x] Add corpus/chunk tables (movie-linked) + embedding metadata.
- [x] Add retrieval run + diagnostics persistence model.
- [x] Migration + Prisma generate/deploy verified.

Exit criteria:
- New schema migrates cleanly in local + test DB.

### Phase C: Ingestion/Indexing Jobs
- [x] Build deterministic ingest adapters for approved local/curated sources.
- [x] Normalize + dedupe pipeline.
- [x] Chunking module with deterministic chunk IDs.
- [x] Embedding write path + index refresh job.
- [x] Idempotent run checkpoints and resume support.

Exit criteria:
- Re-running jobs yields stable outputs with same inputs.

### Phase D: Hybrid Retrieval
- [x] Implement lexical retriever.
- [x] Implement semantic retriever.
- [x] Implement fusion/rerank + metadata filters.
- [x] Implement governance layer (trust/freshness/diversity/source caps).
- [x] Add deterministic fallback mode.

Exit criteria:
- Retrieval returns stable top-k for fixed fixture + passes quality gates.

### Phase E: Runtime Integration
- [x] Wire `generateRecommendationBatchModern` to retriever V2.
- [x] Wire companion endpoint to retriever V2.
- [x] Keep feature flags:
  - [x] `EVIDENCE_RETRIEVAL_MODE=cache|hybrid`
  - [x] `EVIDENCE_RETRIEVAL_REQUIRE_INDEX=true|false`

Exit criteria:
- End-to-end retrieval is used in hybrid mode; cache mode still works.

### Phase F: CI + Observability
- [x] Add deterministic retrieval fixtures + regression tests.
- [x] Add diagnostics/metrics emission and admin visibility.
- [x] Add CI gates for overlap/citation/retrieval health.

Exit criteria:
- CI blocks regressions, metrics emitted consistently.

### Phase G: Rollout
- [x] Shadow mode validation.
- [x] Progressive rollout (10% -> 50% -> 100%).
- [x] Rollback script and operator runbook.

Exit criteria:
- Production stable at 100% with no quality regressions.

## 5) Task Backlog (Granular)

### Immediate Sprint (next implementation slice)
- [x] Add retrieval schema models and migration.
- [x] Create `src/lib/evidence/retrieval/` module scaffold:
  - [x] `types.ts`
  - [x] `lexical-retriever.ts`
  - [x] `semantic-retriever.ts`
  - [x] `fusion-reranker.ts`
  - [x] `governance.ts`
  - [x] `index.ts`
- [x] Implement `EvidenceRetrieverV2` adapter with fallback to existing cache retriever.
- [x] Add feature-flag wiring in recommendation engine + companion route.
- [x] Add first deterministic fixture tests.

### Secondary Sprint
- [x] Build ingestion + chunking scripts in `scripts/`.
- [x] Add offline eval command for retrieval quality.
- [x] Add admin debug endpoint for retrieval traces.

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

Measurable value report:
```bash
npm run bootstrap:rag:value -- --runs 25
npm run measure:rag:value
npm run measure:rag:value -- --enforce
npm run report:rag:completion -- --enforce
```

Rollout / rollback helper:
```bash
npm run retrieval:rollout -- --mode hybrid --requireIndex false --env .env.production --dryRun
npm run retrieval:rollout -- --mode cache --requireIndex false --env .env.production
npm run assess:retrieval:rollout -- --take 500
npm run check:retrieval:tracker
```

Season 1 node pipeline:
```bash
node --experimental-strip-types scripts/seed-season1-horror-subgenres.ts
node --experimental-strip-types scripts/publish-season1-node-release.ts
node --experimental-strip-types scripts/audit-season1-node-population.ts
```

Evidence ingestion (resume-capable):
```bash
npm run ingest:evidence:corpus -- --input <file> --resume --checkpoint artifacts/evidence-ingest-checkpoint.json
npm run refresh:evidence:index -- --batchSize 500
```

Tests (current relevant):
```bash
npx vitest run tests/prisma/season1-node-governance-controls.test.ts
npx vitest run tests/prisma/season1-published-snapshot-read.test.ts
npx vitest run tests/prisma/season1-weak-supervision-fixture.test.ts
```

## 10) Handoff Checklist (for next engineer/LLM)
- [x] Read this tracker fully.
- [x] Confirm branch/worktree state (`git status --short`).
- [x] Run baseline tests listed above.
- [x] Start Phase A + B before coding retrieval logic.
- [x] Keep updates in this tracker under Change Log.

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
- [x] Embedding model choice for local/offline deterministic tests.
- [x] ANN backend strategy in local vs production.
- [x] Source licensing boundary for external text ingestion.

## 13) Change Log
- 2026-03-03: Tracker created; initial phased plan and acceptance criteria defined.
- 2026-03-04: Added retrieval V2 runtime scaffold (`src/lib/evidence/retrieval/*`) with lexical + semantic + RRF fusion + governance caps and deterministic fallback. Wired companion to retriever V2 and season-aware node lookup for active pack; added initial deterministic runtime tests.
- 2026-03-04: Added retrieval diagnostics persistence model (`RetrievalRun`) with Prisma migration `20260311110000_retrieval_runs`, wired hybrid retriever run logging (success + fallback), and shipped admin endpoint `GET /api/admin/retrieval` with API tests.
- 2026-03-04: Added evidence corpus schema (`EvidenceDocument`, `EvidenceChunk`) with migration `20260311121500_evidence_corpus`, deterministic chunking + idempotent ingestion module (`src/lib/evidence/ingestion/*`), retrieval fusion support for chunk corpus, and operator command `npm run ingest:evidence:corpus -- --input <file>`.
- 2026-03-04: Added chunk embedding backfill module (`src/lib/evidence/ingestion/embed.ts`) + operator command `npm run backfill:evidence:embeddings`, and retrieval quality gate evaluator (`src/lib/evidence/retrieval/quality-gates.ts`) exposed in `GET /api/admin/retrieval`.
- 2026-03-04: Added retrieval metrics module (`src/lib/evidence/retrieval/metrics.ts`) and gate-check command `npm run check:retrieval:gates` for CI/operator blocking on degraded retrieval health.
- 2026-03-04: Added persisted retrieval quality signals on `RetrievalRun` (`duplicateRate`, `citationValidRate`) via migration `20260311134000_retrieval_run_quality_metrics`, with hybrid retriever runtime computing/storing real values for gate evaluation.
- 2026-03-04: Added narrative-aware citation validity computation in recommendation runtime (`computeCitationValidRateFromNarrative`) and post-compose backfill to update matching retrieval runs with real `citationValidRate`.
- 2026-03-04: Added retrieval provenance contract to recommendation and companion evidence payloads (mode/source/fallback + hybrid scoring metadata), updated canonical `MovieCardVM` schema, and covered with runtime/route/integration tests.
- 2026-03-04: Added evidence ingestion checkpoint/resume support with deterministic content-hash skipping (`--resume --checkpoint ...`) and unit coverage in `tests/unit/evidence-ingestion-checkpoint.test.ts`.
- 2026-03-04: Added measurable retrieval value report command `npm run measure:rag:value` (optionally `--enforce`) with explicit goals for retrieval health, corpus coverage, and observability sample size.
- 2026-03-04: Wired retrieval gate enforcement into release validation plan (`scripts/validate-rc.ts`) alongside existing external-link gates, with env-controlled skips and unit coverage for the command plan.
- 2026-03-04: Added retrieval rollout/rollback operator support via `npm run retrieval:rollout` and runbook `docs/retrieval-rollout-runbook.md`, including dry-run safe env updates for `EVIDENCE_RETRIEVAL_MODE` and `EVIDENCE_RETRIEVAL_REQUIRE_INDEX`.
- 2026-03-04: Added shadow-mode runtime (`EVIDENCE_RETRIEVAL_MODE=shadow`) that serves cache responses while running hybrid retrieval diagnostics, plus rollout readiness assessor `npm run assess:retrieval:rollout` with stage-level measurable outputs (canary/ramp/full).
- 2026-03-04: Completed measurable progressive-rollout readiness validation with a 300-run window (`npm run assess:retrieval:rollout -- --take 300`) passing canary/ramp/full criteria and `npm run measure:rag:value -- --take 300 --enforce` passing all value goals.
- 2026-03-04: Resolved open retrieval decisions in `docs/retrieval-open-decisions-resolved.md` (deterministic embedding model, ANN strategy, and licensing boundary).
- 2026-03-04: Added automated retrieval checklist gate `npm run check:retrieval:tracker` and wired it into release validation planning so unchecked tracker items fail validation.
- 2026-03-04: Added machine-readable completion artifact command `npm run report:rag:completion` (optionally `--enforce`) to prove tracker completeness + retrieval quality + rollout readiness in one report.
- 2026-03-04: Updated release validation planning to include enforced completion artifact generation (`npm run report:rag:completion -- --enforce`) for measurable go/no-go checks.
- 2026-03-04: Closed remaining ingestion/indexing in-progress items by adding deterministic ingest normalization+dedupe adapters and full index refresh command (`npm run refresh:evidence:index`) with unit coverage.

