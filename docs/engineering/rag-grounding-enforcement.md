# RAG Grounding Enforcement

Generated: 2026-03-04 (America/Chicago)

## Final Answer Prompt Inventory

### Companion answer prompt
- File: [route.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/api/companion/route.ts)
- Function: `generateCompanionLlmOutput`
- System prompt now explicitly requires factual statements to include citations in the exact format:
  - `[doc:... chunk:...]`

### Recommendation explainability prompt
- File: [recommendation-engine.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/recommendation/recommendation-engine.ts)
- Function: `composeCardNarrative`
- Existing prompt already enforces evidence-backed claims with evidence refs (`[E#]`) and schema validation.

## Grounding Contract Implemented

### A) Citation requirement for factual output
- Companion LLM prompt updated to require citation tokens from retrieved evidence IDs.
- Companion output is post-processed with citation enforcement (`enforceCitationCoverage`) so summary/trivia lines keep `doc/chunk` citations.

### B) Abstention on insufficient evidence
- Companion now computes grounded chunk count from retrieval provenance (`sourceType=chunk` with `documentId` + `chunkId`).
- If count `< N`, endpoint returns uncertainty template sections instead of factual synthesis.
- `N` is configurable via `COMPANION_MIN_GROUNDED_CHUNKS` (default `2`, `0` disables).
- Refusal template:
  - `I do not have enough season-scoped evidence to answer this confidently...`

### C) Retrieval provenance hardening
- `EvidenceProvenance` now carries `chunkId`.
- Hybrid retriever now includes chunk id in chunk evidence provenance so citations can reference `doc/chunk`.

## Automated Harness (30 queries)

- File: [grounding.test.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/rag/grounding.test.ts)
- Composition:
  - 10 Season 1 (horror) queries
  - 10 Season 2 (cult) queries
  - 10 negative queries expected to abstain
- Metrics computed with `computeGroundingMetrics`:
  - `citationCoverageRate`
  - `abstainPrecision`
  - `hallucinationRiskCases`

### Harness results
- Total queries: `30`
- Citation coverage rate: `1.00`
- Abstain precision: `1.00`
- Hallucination risk cases: `0`

## Regression Tests

### Season representative checks (3 each)
- Included in `tests/rag/grounding.test.ts`:
  - 3 representative Season 1 queries assert `doc/chunk` citations.
  - 3 representative Season 2 queries assert `doc/chunk` citations.

### Companion abstention check
- Added to [companion-route.test.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/api/companion-route.test.ts):
  - verifies abstention when grounded chunk evidence is below threshold.

## Key Diffs
- [route.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/api/companion/route.ts)
- [grounding.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/rag/grounding.ts)
- [evidence-retriever.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/evidence/evidence-retriever.ts)
- [index.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/evidence/retrieval/index.ts)
- [grounding.test.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/rag/grounding.test.ts)
