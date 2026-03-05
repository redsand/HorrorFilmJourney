# Unresolved TMDB Resolution

Generated: 2026-03-04 (America/Chicago)

## Problem
- `snapshot-db-repair-report.json` reported one unresolved entry:
  - title: `Naked Blood` (1996)
  - tmdbId: `778000`
  - node: `grindhouse-exploitation`
  - tier: `EXTENDED`

## Verification
1. Local runtime DB check:
   - `Movie` row for `tmdbId=778000` did not exist.
2. Local TMDB-backed catalog backup check:
   - `backups/catalog-backup-2026-03-04T19-25-15-533Z.json` did not contain `tmdbId=778000`.
   - It contains the same film under `tmdbId=36075` with title `Splatter: Naked Blood`.
3. Resolver behavior:
   - Resolver logic can resolve by tmdb hint when the tmdb id exists in the catalog index.
   - Failure was data availability (`778000` absent), not normalization.

## Fix Implemented
- Added deterministic backfill registry:
  - [deterministic-tmdb-backfill.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/catalog/deterministic-tmdb-backfill.ts)
  - Includes explicit seed for `tmdbId=778000` (`Naked Blood`, 1996) with poster/credits/ratings metadata.
- Wired deterministic backfills into Season 2 import catalog load:
  - [import-season2-mastered.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/scripts/import-season2-mastered.ts)
  - Backfilled ids are appended to catalog map without discover/network lookup.
- Wired deterministic unresolved repair into dataset repair:
  - [repair-season-dataset.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/scripts/repair-season-dataset.ts)
  - For unresolved ids, upserts `Movie` + `MovieRating` from deterministic seed, then inserts authoritative `NodeMovie`.

## Regression Test
- Added:
  - [deterministic-tmdb-backfill.test.ts](C:/Users/TimShelton/source/repos/HorrorFilmJourney/tests/unit/deterministic-tmdb-backfill.test.ts)
- Coverage:
  - Asserts seed exists for `778000`.
  - Asserts tmdb-id-hint resolution succeeds even when title normalization differs.

## Validation Run
- Tests:
  - `npx vitest run tests/unit/deterministic-tmdb-backfill.test.ts tests/unit/snapshot-db-divergence.test.ts`
  - Passed (`10/10` tests).
- Repair rerun:
  - `node --experimental-strip-types scripts/repair-season-dataset.ts`
  - Result for `season-2/cult-classics`: `preLoss=0.18%`, `postLoss=0.00%`.

