# RAG Season Isolation Enforcement

## Scope audited
- `src/app/api/companion/route.ts`
- `src/lib/recommendation/recommendation-engine.ts`
- `src/lib/recommendation/recommendation-engine-v1.ts`
- `scripts/audit-rag-determinism.ts`
- `scripts/bootstrap-rag-value-baseline.ts`
- `src/lib/evidence/retrieval/index.ts`

## 1) EvidenceRetriever call-site audit

### Season-aware call sites (all now pass `seasonSlug` + `packSlug`)
- `src/app/api/companion/route.ts:971`
- `src/lib/recommendation/recommendation-engine.ts:1671`
- `src/lib/recommendation/recommendation-engine-v1.ts:390`
- `scripts/audit-rag-determinism.ts:163`
- `scripts/bootstrap-rag-value-baseline.ts:85`

### Notes
- Legacy helper `CachedEvidenceRetrieverV1` in `src/lib/recommendation/recommendation-engine.ts:1296` now logs `RAG_MISSING_SEASON_CONTEXT` and returns empty if required context is missing.

## 2) Context propagation verification
- Season-aware retrieval queries now include:
  - `seasonSlug`
  - `packSlug`
  - `requireSeasonContext: true`
  - `callerId`
- Missing context behavior:
  - Retriever logs `RAG_MISSING_SEASON_CONTEXT`
  - Returns empty evidence (no silent global fallback)

## 3) Retrieval enforcement added
Implemented in `src/lib/evidence/retrieval/index.ts`:
- If `query.seasonSlug` exists:
  - chunk candidates are filtered pre-ranking with:
    - `document.seasonSlug === query.seasonSlug`
- If `requireSeasonContext=true` and `packSlug` missing:
  - log `RAG_MISSING_SEASON_CONTEXT`
  - stop retrieval (empty result)

## 4) Contamination detection logging
Implemented post-selection contract check in `src/lib/evidence/retrieval/index.ts`:
- If returned evidence has mismatched season metadata:
  - log `RAG_SEASON_CONTAMINATION`
  - drop mismatching evidence

## 5) Tests proving Season 1 never retrieves Season 2 evidence

### Integration test
- `tests/prisma/evidence-retrieval-season-isolation.test.ts`
- Seeds one Season 1 evidence doc/chunk and one Season 2 doc/chunk for the same movie.
- Executes two queries:
  - `seasonSlug=season-1, packSlug=horror`
  - `seasonSlug=season-2, packSlug=cult-classics`
- Asserts each result set only contains evidence with matching season metadata.

### Additional regression coverage
- `tests/unit/evidence-retrieval-runtime.test.ts`
  - missing context path logs `RAG_MISSING_SEASON_CONTEXT`
  - contamination path logs `RAG_SEASON_CONTAMINATION` and drops evidence
- `tests/api/companion-route.test.ts`
  - verifies companion retrieval remains season-scoped
- `tests/prisma/recommendation-engine-modern.test.ts`
  - verifies recommendation retrieval runs persist season/pack scope

## Enforcement outcome
- Season-aware retrieval is now explicitly scoped and guarded.
- Missing season/pack context is visible and non-silent.
- Cross-season chunk contamination is blocked and logged.
