# Credits Ingestion Audit

Date: 2026-03-04
Scope: TMDB ingestion paths that create/update `Movie` rows and can affect `director` + `castTop`.

## Paths Audited

1. `scripts/sync-tmdb-catalog.ts` (full catalog discover + details ingestion)
2. `scripts/sync-tmdb-catalog-update.ts` (incremental update ingestion)
3. `src/lib/tmdb/live-candidate-sync.ts` (runtime refresh/discover job)
4. `src/app/api/admin/curriculum/node-movies/route.ts` (detail ingestion for admin add-by-tmdb)

## Findings

1. Full sync and incremental sync requested credits, but could overwrite existing credits with empty values when TMDB returned sparse/missing credits payloads.
2. Live refresh sync did not request details/credits at all, so new rows created from discover were missing `director`/`castTop`.
3. Admin node-movie TMDB path requested credits, but upsert update path could overwrite with empty values if credits were missing in payload.

## Fixes Applied

1. Added `src/lib/tmdb/credits-guard.ts` with `mergeCreditsWithGuard(...)`.
   - Behavior: keep existing `director`/`castTop` when incoming credits are empty/null.
   - Behavior: use incoming credits when present.
2. Updated `scripts/sync-tmdb-catalog.ts` to merge incoming credits with existing credits before upsert write.
3. Updated `scripts/sync-tmdb-catalog-update.ts` to merge incoming credits with existing credits before upsert write.
4. Updated `src/lib/tmdb/live-candidate-sync.ts` to fetch `/movie/{id}?append_to_response=credits`, parse credits, and persist via guarded merge.
5. Updated `src/app/api/admin/curriculum/node-movies/route.ts` to apply guarded credit merge in TMDB upsert path.

## Regression Test Added

`tests/unit/credits-ingestion-guard.test.ts`

1. Verifies existing credits are preserved when incoming payload has missing/empty credits.
2. Verifies incoming credits replace existing credits when incoming payload is populated.

## Expected Outcome

Credits coverage should no longer regress due to refresh/update passes that encounter sparse TMDB credits payloads. New TMDB discover rows in live refresh now attempt credits hydration immediately, and updates are non-destructive by default.

