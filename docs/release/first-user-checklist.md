# Ready for First Real User Checklist

## A) Environment & Config

- [x] `DATABASE_URL` points to Postgres.  
  Coverage: `/scripts/reset-test-db.ts`, `/tests/helpers/test-db.ts`
- [x] `DATABASE_URL_TEST` points to dedicated test DB/schema.  
  Coverage: `/scripts/reset-test-db.ts`, `/docs/release/test-plan.md`
- [x] `ADMIN_TOKEN` is set for internal testing.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/*.test.ts`
- [x] LLM disabled/deterministic for tests (`USE_LLM=false`, `LLM_PROVIDER` unset).  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/e2e/narrative-loop.e2e.test.ts`
- [x] No external network calls during tests.  
  Coverage: `/tests/setup/no-network.ts`

## B) Database & Prisma

- [x] `prisma validate` + `prisma generate` succeed.  
  Coverage: `npm run validate:rc` (runs both), `/scripts/validate-rc.ts`
- [x] Migrations/schema apply cleanly to dev/test DB.  
  Coverage: `/scripts/reset-test-db.ts`, `/tests/helpers/test-db.ts`
- [x] Seed script is idempotent and produces >=30 complete movies.  
  Coverage: `/tests/e2e/seed-catalog.e2e.test.ts`

## C) API Contract (MovieCardVM)

- [x] `/api/recommendations/next` returns exactly 5 cards.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/acceptance/recommendations.contract.test.ts`
- [x] Every card validates against `zMovieCardVM`.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/acceptance/recommendations.contract.test.ts`
- [x] `posterUrl` always present.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/prisma/recommendation-engine-modern.test.ts`
- [x] Ratings include IMDb + >=1 additional.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/unit/recommendation-eligibility.test.ts`
- [x] `reception` key exists (score or fallback summary).  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/acceptance/recommendations.contract.test.ts`
- [x] Credits include cast/director behavior with fallback.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/companion-route.test.ts`, `/docs/api.md`
- [x] `streaming` key exists with `offers` array (empty allowed).  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/acceptance/recommendations.contract.test.ts`
- [x] `evidence` key exists (empty allowed).  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/evidence-upsert-and-recommendations.test.ts`
- [x] `codex.watchFor` is exactly 3 items.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/unit/contracts.test.ts`
- [x] `spoilerPolicy` present.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/companion-route.test.ts`

## D) Core UX Loop (E2E Covered)

- [x] Create user.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`
- [x] `GET /api/experience` => `ONBOARDING_NEEDED` for new user.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`
- [x] `POST /api/onboarding` completes onboarding and persists profile.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/onboarding-route.test.ts`
- [x] `GET /api/experience` => `SHOW_RECOMMENDATION_BUNDLE` after onboarding.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/prisma/experience-state.test.ts`
- [x] `POST /api/recommendations/next` returns valid batch/cards.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`
- [x] `POST /api/interactions` WATCHED requires rating and stores poll.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/interactions-route.test.ts`
- [x] `POST /api/interactions` ALREADY_SEEN requires rating and stores poll.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/interactions-route.test.ts`
- [x] Regeneration rule: 3 ALREADY_SEEN in one batch triggers `nextBatch`.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/interactions-route.test.ts`
- [x] `GET /api/history` returns interactions and is user-scoped.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/history-route.test.ts`
- [x] `GET /api/history/summary` returns aggregate fields correctly.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/history-summary-route.test.ts`
- [x] `GET /api/companion` returns required keys, spoiler policy behavior, and sections.  
  Coverage: `/tests/e2e/first-user-readiness.e2e.test.ts`, `/tests/api/companion-route.test.ts`

## E) Docs Consistency

- [x] `/docs/design-spec.md` contains R1..R14 and aligns with implementation intent.  
  Coverage: `/tests/unit/docs-smoke.test.ts`
- [x] Docs examples are valid (`movies/upsert` includes `posterUrl`, health header expectations documented).  
  Coverage: `/tests/unit/docs-smoke.test.ts`, `/docs/api.md`, `/docs/internal-testing.md`
- [x] Internal testing runbook shows required headers (`x-admin-token`, `x-user-id`).  
  Coverage: `/docs/internal-testing.md`, `/docs/release/user-testing-runbook.md`

## F) Test Suite Health

- [x] Unit tests pass.  
  Coverage: `npm run validate:rc` (`npm test -- tests/unit`)
- [x] API tests pass.  
  Coverage: `npm run validate:rc` (`npm test -- tests/api`)
- [x] E2E tests pass.  
  Coverage: `npm run validate:rc` (`npm run test:e2e`)
- [x] Docs smoke tests pass.  
  Coverage: `/tests/unit/docs-smoke.test.ts`
- [x] No `vi.mock` hoisting regressions.  
  Coverage: `npm run validate:rc` full test execution + `/docs/testing.md` hoisting rule
