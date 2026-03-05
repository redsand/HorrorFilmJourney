# Packs Launch Plan (Season 1: Horror Only)

## Scope
- Launch packs end-to-end with one enabled pack only: `horror`.
- Keep rollout reversible behind `SEASONS_PACKS_ENABLED` behavior.
- No new genre ingestion in this launch.

## Current Implementation Findings
- Feature flag: `SEASONS_PACKS_ENABLED` in [`src/lib/feature-flags.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/feature-flags.ts).
- Data models: `Season`, `GenrePack`, `UserProfile.selectedPackId`, `RecommendationBatch.packId`, `JourneyProgress.packId` in [`prisma/schema.prisma`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/prisma/schema.prisma).
- Packs API: `GET /api/packs` in [`src/app/api/packs/route.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/api/packs/route.ts).
- Pack selection API: `POST /api/profile/select-pack` in [`src/app/api/profile/select-pack/route.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/api/profile/select-pack/route.ts).
- Experience state gate: `PACK_SELECTION_NEEDED` in [`src/lib/experience-state.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/experience-state.ts).
- Recommendation scoping:
  - Effective pack resolved in [`src/lib/packs/pack-resolver.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/packs/pack-resolver.ts).
  - Batch creation uses resolved pack in [`src/lib/recommendation/recommendation-engine.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/recommendation/recommendation-engine.ts).
- History scoping:
  - Pack-aware filtering with `packScope=current|all` in
    - [`src/app/api/history/route.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/api/history/route.ts)
    - [`src/app/api/history/summary/route.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/api/history/summary/route.ts)
    - [`src/lib/history/pack-scope.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/history/pack-scope.ts)
- UI integration:
  - Pack selection screen in Journey page: [`src/app/journey/page.tsx`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/journey/page.tsx)
  - Admin controls page: [`src/app/admin/packs/page.tsx`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/admin/packs/page.tsx)
  - Admin APIs:
    - [`src/app/api/admin/packs/route.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/api/admin/packs/route.ts)
    - [`src/app/api/admin/packs/[id]/route.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/app/api/admin/packs/[id]/route.ts)

## Authoritative Launch Decisions
- Flag behavior: packs are currently forced ON in code (`seasonsPacksEnabled()` returns `true`).
- Active season: exactly one season has `isActive=true`; launch target is `season-1`.
- Enabled packs for launch: only `horror` (`isEnabled=true`), all other packs in Season 1 must be `isEnabled=false`.
- Experience flow when flag is ON:
  1. No selected pack -> `PACK_SELECTION_NEEDED`
  2. Pack selected, onboarding incomplete -> `ONBOARDING_NEEDED`
  3. Onboarding complete -> normal recommendation flow

## Data/Migration Strategy
- Migration: [`prisma/migrations/20260308170000_packs_launch_horror_bootstrap/migration.sql`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/prisma/migrations/20260308170000_packs_launch_horror_bootstrap/migration.sql)
  - Ensures Season 1 exists and active
  - Ensures Horror pack exists and enabled
  - Disables other Season 1 packs
  - Backfills `UserProfile.selectedPackId`, `RecommendationBatch.packId`, `JourneyProgress.packId` when null
- Seed alignment:
  - Catalog seed also ensures Season 1 + Horror pack in [`src/lib/testing/catalog-seed.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/testing/catalog-seed.ts)

## Enable Procedure
1. Apply migrations.
2. Run catalog seed.
3. Ensure packs mode is ON (`seasonsPacksEnabled()` true, or env-gated equivalent if reintroduced).
4. Validate:
   - `GET /api/packs` returns Season 1 + Horror enabled.
   - New user sees pack selection before onboarding.
   - Recommendations/history/progression behave with pack context.

## Rollback Plan
1. Reintroduce env-gated flag behavior and set packs mode OFF.
2. Keep data as-is; code will continue to operate with default Horror behavior.
3. Validate:
   - Journey no longer blocks on pack selection.
   - `/api/packs` still returns Season 1/Horror payload.
   - Existing recommendations/history remain readable.

## Test Coverage
- API:
  - [`tests/api/packs-route.test.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/api/packs-route.test.ts)
  - [`tests/api/profile-select-pack-route.test.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/api/profile-select-pack-route.test.ts)
  - [`tests/api/admin-packs-route.test.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/api/admin-packs-route.test.ts)
  - [`tests/api/history-route.test.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/api/history-route.test.ts)
  - [`tests/api/history-summary-route.test.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/api/history-summary-route.test.ts)
- Prisma/integration:
  - [`tests/prisma/experience-state.test.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/prisma/experience-state.test.ts)
  - [`tests/prisma/seed-catalog-verification.test.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/prisma/seed-catalog-verification.test.ts)
- E2E:
  - [`tests/e2e/history-pack-scope.e2e.test.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/e2e/history-pack-scope.e2e.test.ts)
