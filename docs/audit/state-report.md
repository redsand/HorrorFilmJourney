# Project State Report

Date: 2026-03-02  
Scope: stabilization only (no new features)

## Status Summary
- Prisma generation: `PASS` (`npm run prisma:generate`)
- Test harness reliability: `PASS` (cross-platform DB setup + no `vi.mock` hoisting failures)
- Spec/implementation alignment: `PASS` for ratings eligibility, health headers, poster requirement
- Documentation correctness: `PASS` for corrected API/examples and testing guidance
- Full test run: `PASS` (`29` files, `88` tests, `0` failures)

## Prioritized Fix Plan
- [x] Critical: stabilize Prisma generation and client usability
- [x] High: eliminate Vitest `vi.mock` hoisting initialization failures
- [x] High: make integration tests deterministic on PostgreSQL in Windows
- [x] Medium: resolve ratings-eligibility rule drift and prevent regression with a unit test
- [x] Medium: fix `/api/movies/upsert` documentation example (`posterUrl`)
- [x] Medium: resolve `/api/health` header contradiction across route/tests/docs
- [x] Medium: improve Companion credits behavior and document fallbacks
- [x] Final: produce this report with authoritative rules and verification output

## Truth Table (Authoritative Rules)
| Area | Source-of-truth rule | Code updated | Tests/docs updated |
|---|---|---|---|
| Ratings eligibility | Recommend only if movie has non-empty `posterUrl`, includes `IMDB`, and has `>= 3` total rating sources | `src/lib/recommendation/recommendation-engine-v1.ts`, `src/lib/recommendation/recommendation-engine.ts` | `tests/unit/recommendation-eligibility.test.ts`, `tests/prisma/recommendation-engine-v1.test.ts`, `tests/acceptance/utils/recommendations-seed.ts`, `tests/api/evidence-upsert-and-recommendations.test.ts`, `docs/design-spec.md`, `docs/recommendation-engine.md` |
| `/api/health` headers | `x-admin-token` required; `x-user-id` not required | `src/app/api/health/route.ts` | `tests/api/health-route.test.ts`, `README.md`, `docs/api.md` |
| `posterUrl` requirement | `posterUrl` is required on movie upsert and required for recommendation eligibility | `src/app/api/movies/upsert/route.ts`, recommendation engines | `docs/internal-testing.md`, `docs/api.md`, `tests/unit/docs-smoke.test.ts` |

## What Was Broken and What Changed
- Prisma/test harness:
  - Replaced SQLite/file-based test URL assumptions with Postgres schema-based test URLs.
  - Added shared helper: `tests/helpers/test-db.ts`.
  - Added Prisma client smoke test: `tests/prisma/prisma-client-smoke.test.ts`.
  - Fixed acceptance-suite schema collision by assigning unique schemas per suite.
- Vitest mocking:
  - Refactored API tests to `vi.hoisted(...)` mock pattern to avoid hoisting `ReferenceError`.
  - Added testing doc guidance in `docs/testing.md`.
- Contract/documentation alignment:
  - Enforced strict ratings eligibility (`IMDB + >=3 total`) in both engines.
  - Added explicit drift-prevention unit test.
  - Corrected `/api/health` behavior/docs/tests to one consistent rule.
  - Updated companion endpoint to return director/cast when available and fallback note when missing.
  - Corrected docs example for `/api/movies/upsert` to include `posterUrl`.

## Verification
- `npm test`: **PASS** (`29 passed`, `88 passed`, `0 failed`)
- `npm run prisma:generate`: **PASS**

## Remaining Risks
- Postgres test schemas accumulate over time; optional future cleanup step could drop old test schemas after runs.
- `docs/snapshots/recommendations-next.sample.json` changes whenever snapshot acceptance test is executed; this is expected by current workflow.
