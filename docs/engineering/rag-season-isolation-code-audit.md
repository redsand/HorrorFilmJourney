# RAG Season Isolation Code Audit

## Executive summary (PASS/FAIL)
- **Result:** **PASS with caveats** after patch.
- Core retriever architecture is season-independent (no season-1/season-2 branching in retrieval logic).
- Season isolation is now contract-enforced for season-aware callers, with explicit logging and global-scope opt-in.
- Residual caveat: packet-level evidence rows still do not carry season/pack metadata, so packet provenance cannot be strictly asserted by metadata alone.

## Top risks (ranked)
1. **P1: Packet evidence metadata gap**
- `EvidencePacket` has no `seasonSlug`/`packId` fields, so contamination checks can only strictly assert season for chunk/external sources.
2. **P2: Taxonomy version propagation gap**
- `taxonomyVersion` is present in broader domain models but not propagated into retrieval query flow or ranking filters.
3. **P2: Non-retrieval hardcoded season branching in explainability builders**
- Present in context/render logic, not in retriever core; should move to registry/plugin over time.

## Call-site inventory

| Path:Line | Function/Route | seasonSlug available | seasonSlug passed | pack passed | taxonomyVersion passed | includeExternalReadings | Category |
|---|---|---:|---:|---:|---:|---|---|
| `src/app/api/companion/route.ts:971` | `GET /api/companion` evidence retrieval | yes | yes | yes (`packId`) | no | yes (explicit `true`) | season-scoped |
| `src/lib/recommendation/recommendation-engine.ts:1663` | modern recommendation narrative evidence | yes | yes | yes (`packId`) | no | implicit default (`true`) | season-scoped |
| `src/lib/recommendation/recommendation-engine-v1.ts:389` | v1 recommendation evidence | yes | yes | yes (`packId`) | no | implicit default (`true`) | season-scoped |
| `scripts/audit-rag-determinism.ts:163` | determinism audit script | yes | yes | yes (`packId`) | no | yes (explicit `true`) | season-scoped |
| `scripts/bootstrap-rag-value-baseline.ts:85` | baseline bootstrap script | yes | yes | no | no | implicit default (`true`) | season-scoped |
| `src/lib/recommendation/recommendation-engine.ts:1296` | `CachedEvidenceRetrieverV1` legacy helper | optional | guarded (returns empty/log when missing) | no | no | n/a (packet cache path) | season-scoped (guarded) |

Notes:
- Admin/debug retrieval endpoint (`src/app/api/admin/retrieval/route.ts`) reads retrieval diagnostics only; it does not execute retrieval.
- No season-aware retrieval call site now silently falls back to global scope.

## Filtering behavior analysis

### End-to-end propagation
- Request/user-context resolution to season/pack exists for companion and recommendation flows.
- Retrieval query now carries `requireSeasonContext` and `callerId` for season-aware surfaces.

### Core filtering and isolation
- External readings are season-filtered in DB query (`where season.slug = query.seasonSlug`).
- Chunks are now season-filtered **before scoring/ranking** (`document.seasonSlug = query.seasonSlug` when present).
- Post-selection contract validates provenance season and drops mismatches, logging `RAG_SEASON_CONTAMINATION`.
- Missing season context without explicit global opt-in logs `RAG_MISSING_SEASON_CONTEXT` and returns empty evidence.
- Explicit global scope requires `allowCrossSeason=true` and logs `RAG_GLOBAL_SCOPE_ENABLED`.

### Governance/reranker contamination check
- Lexical/semantic/fusion/governance stages are metadata-agnostic.
- Because season filtering happens prior to these stages and contract checks happen after selection, these stages cannot reintroduce cross-season candidates.

## Hardcoded season logic findings
- Retrieval core (`src/lib/evidence/retrieval/index.ts`) has no season-specific branching.
- Remaining season-branch logic exists in explainability builders:
  - `src/lib/context/build-season-reason-panel.ts:428`
  - `src/lib/context/build-film-context-explanation.ts:547`
- These are presentation/context policy concerns, not retriever-core concerns; recommend registry/plugin refactor later.

## Patch plan + diffs summary
- Added retrieval contract fields and metadata:
  - `src/lib/evidence/evidence-retriever.ts`
- Enforced season isolation contract and explicit global-mode gate:
  - `src/lib/evidence/retrieval/index.ts`
  - Added `RAG_MISSING_SEASON_CONTEXT`, `RAG_GLOBAL_SCOPE_ENABLED`, `RAG_SEASON_CONTAMINATION` logging.
  - Added pre-ranking chunk season filter.
- Updated season-aware call sites to pass explicit contract flags:
  - `src/app/api/companion/route.ts`
  - `src/lib/recommendation/recommendation-engine.ts`
  - `src/lib/recommendation/recommendation-engine-v1.ts`
  - `scripts/audit-rag-determinism.ts`
  - `scripts/bootstrap-rag-value-baseline.ts`
- Removed season default fallback in pack-scoped candidate generation:
  - `src/lib/recommendation/recommendation-engine.ts`

## Test plan + what was added
- Unit contract regressions:
  - `tests/unit/evidence-retrieval-runtime.test.ts`
  - Added: missing-season context logs/returns empty; cross-season contamination drop+log.
- Integration season-isolation regression:
  - `tests/prisma/evidence-retrieval-season-isolation.test.ts`
  - Seeds season-1 and season-2 evidence for same movie; asserts each query returns only matching-season evidence.
- Call-site propagation regression:
  - `tests/api/companion-route.test.ts`
  - Added assertion that companion retrieval executes with season-scoped external query.
  - `tests/prisma/recommendation-engine-modern.test.ts`
  - Added assertion retrieval runs include season+pack scope in modern recommendations.

## Verification run
- `tests/unit/evidence-retrieval-runtime.test.ts`
- `tests/unit/evidence-retrieval-diagnostics.test.ts`
- `tests/api/companion-route.test.ts`
- `tests/prisma/evidence-retrieval-season-isolation.test.ts`
- `tests/prisma/recommendation-engine-modern.test.ts`

All above passed.
