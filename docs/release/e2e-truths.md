# E2E Truths

## Allowed DB Seeding

Direct DB writes in E2E are allowed only for:

- resetting DB state between tests
- seeding catalog/supporting data:
  - movies
  - ratings
  - credits metadata (director/cast)
  - evidence packets
  - optional streaming cache

## Forbidden DB Bypass

Direct DB writes are forbidden in E2E for core user flows:

- onboarding submission
- recommendation generation
- interactions logging
- experience state transitions
- history retrieval and summary
- companion retrieval

Those must be exercised through route handlers.

## Endpoints E2E Must Exercise

- `POST /api/users`
- `GET /api/experience`
- `POST /api/onboarding`
- `POST /api/recommendations/next`
- `POST /api/interactions`
- `GET /api/history`
- `GET /api/history/summary`
- `GET /api/companion`

## Determinism Requirements

- No external network calls in tests (`tests/setup/no-network.ts`).
- Stable seeded catalog (`src/lib/testing/catalog-seed.ts`).
- Streaming uses deterministic stub provider in recommendation engines.
- LLM is disabled for tests (`USE_LLM=false`, `LLM_PROVIDER` unset).

## Current Enforcers

- `/tests/e2e/first-user-readiness.e2e.test.ts`
- `/tests/e2e/narrative-loop.e2e.test.ts`
- `/tests/e2e/seed-catalog.e2e.test.ts`
