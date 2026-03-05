# RC Go/No-Go Checklist

## Go/No-Go

- [x] `npm run validate:rc` passes locally with no failed tests.
- [x] No unresolved P0/P1 defects in core narrative flow.
- [x] Known issues (if any) have clear mitigation and owner.

## Spec Coverage Checklist

- [x] Experience gate sequence: `PACK_SELECTION_NEEDED` -> `ONBOARDING_NEEDED` -> `SHOW_RECOMMENDATION_BUNDLE`
  - Tests: `/tests/e2e/narrative-loop.e2e.test.ts`, `/tests/prisma/experience-state.test.ts`
- [x] Recommendation bundle returns exactly 5 cards when inventory allows
  - Tests: `/tests/acceptance/recommendations.contract.test.ts`, `/tests/e2e/narrative-loop.e2e.test.ts`
- [x] Card contract strictness (`MovieCardVM`), including `streaming` and `evidence` keys
  - Tests: `/tests/acceptance/recommendations.contract.test.ts`, `/tests/e2e/narrative-loop.e2e.test.ts`
- [x] Ratings eligibility and card ratings shape (IMDb + additional ratings)
  - Tests: `/tests/unit/recommendation-eligibility.test.ts`, `/tests/prisma/recommendation-engine-modern.test.ts`
- [x] Posters required for recommendation cards
  - Tests: `/tests/prisma/recommendation-engine-modern.test.ts`, `/tests/e2e/narrative-loop.e2e.test.ts`
- [x] Interaction validation (`WATCHED`/`ALREADY_SEEN` require rating)
  - Tests: `/tests/api/interactions-route.test.ts`, `/tests/e2e/narrative-loop.e2e.test.ts`
- [x] History and summary user-scoped correctness
  - Tests: `/tests/api/history-route.test.ts`, `/tests/api/history-summary-route.test.ts`, `/tests/e2e/narrative-loop.e2e.test.ts`
- [x] Companion mode response shape and spoiler behavior
  - Tests: `/tests/api/companion-route.test.ts`, `/tests/e2e/narrative-loop.e2e.test.ts`
- [x] Evidence upsert + propagation to recommendation cards
  - Tests: `/tests/api/evidence-upsert-and-recommendations.test.ts`
- [x] Streaming cache TTL + fallback reliability
  - Tests: `/tests/unit/streaming-lookup-service.test.ts`
- [x] Diagnostics endpoint availability in modern mode
  - Tests: `/tests/acceptance/recommendations.contract.test.ts`, `/tests/api/recommendation-diagnostics-route.test.ts`
- [x] Release docs and design docs smoke validation
  - Tests: `/tests/unit/docs-smoke.test.ts`
- [x] Deterministic starter seed quality (>=30 movies, required fields, evidence coverage + external links gate compatibility)
  - Tests: `/tests/e2e/seed-catalog.e2e.test.ts`
- [x] No network calls in test execution
  - Guard: `/tests/setup/no-network.ts`
- [x] No secret logging patterns in repository test scope
  - Tests: `/tests/unit/no-secrets-logging.test.ts`

## Known Issues / Mitigations

- None currently identified after `validate:rc` pass.
