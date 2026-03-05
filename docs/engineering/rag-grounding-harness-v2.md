# RAG Grounding Harness v2

Generated: 2026-03-05 (America/Chicago)

## Scope Expansion

- Query set expanded from `30` to `80` in [grounding.test.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/rag/grounding.test.ts):
  - `20` Season 1 queries
  - `20` Season 2 queries
  - `20` cross-season negative queries (must abstain)
  - `20` impossible queries (must abstain)

## Metrics Tracked

- `citationCoverageRate`
- `abstainPrecision`
- `hallucinationRiskCases`

## Threshold Enforcement

The harness now enforces:
- `citationCoverageRate >= 0.95`
- `abstainPrecision >= 0.95`

These are hard assertions in the test.

## Latest Run

Command:
- `npx vitest run tests/rag/grounding.test.ts`

Result:
- Test file: PASS
- Total evaluated queries: `80`
- `citationCoverageRate`: `1.00`
- `abstainPrecision`: `1.00`
- `hallucinationRiskCases`: `0`

## Notes

- Representative regression checks remain in place for both seasons (3 each), ensuring citations are present in non-abstain answers.
- Cross-season negative and impossible categories are explicitly configured to abstain to prevent unsupported claims.
