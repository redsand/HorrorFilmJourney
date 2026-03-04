# Catalog Expansion Plan (Discover Without Genre Filters)

## Goal
Expand the local movie catalog using TMDB discover without genre-restricting filters, then keep Season assignment as a separate explicit step.

## Ingestion Audit (Genre Bias Sources)
Current scripts that apply discover/genre restrictions:

1. [`sync-tmdb-catalog.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/scripts/sync-tmdb-catalog.ts)
- Uses `/discover/movie`
- Applies `with_genres` (default `27|53|9648`, overridable by `TMDB_FULL_SYNC_GENRES`)

2. [`sync-tmdb-catalog-update.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/scripts/sync-tmdb-catalog-update.ts)
- Filters movies by configured `TMDB_UPDATE_GENRE_IDS` (default includes horror-adjacent only)

3. [`live-candidate-sync.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/tmdb/live-candidate-sync.ts)
- Uses discover with `with_genres=27`

These paths bias the catalog toward horror/horror-adjacent titles.

## New Expansion Script
Added:
- [`expand-catalog-discover.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/scripts/expand-catalog-discover.ts)
- npm command: `npm run expand:catalog:discover`

Behavior:
1. Calls `/discover/movie` with:
- `sort_by=popularity.desc`
- no `with_genres`
- no `without_genres`
- no genre keyword restrictions
2. Paginates deterministically from `startPage` through `maxPages` (default cap `2000`).
3. Deduplicates discover results by `tmdbId` before detail fetch/upsert.
4. Fetches details (`append_to_response=keywords,credits`) and upserts movie metadata/ratings.
5. Does **not** perform any Season 1 node assignment or release publication.

## Deduplication Rules
1. In-memory dedupe in run:
- `Set<number>` by `tmdbId` from discover pages.
2. Database dedupe:
- `Movie.tmdbId` is unique in Prisma schema.
- Upsert on `tmdbId` is idempotent/retry-safe.
3. Ratings dedupe:
- Upsert by `(movieId, source)` unique key.

## Estimated Catalog Size and Runtime
Assumptions:
1. TMDB discover has practical page availability limits by query.
2. Unique `tmdbId` yield drops as page depth increases (duplicates/stale popularity ordering).

Practical expected ranges for `maxPages=2000`:
1. Unique discover IDs collected: ~50k to ~200k (depends on TMDB availability for deep pages).
2. Persisted movies (post detail/poster guard): typically lower than unique discover IDs.
3. Runtime:
- Detail fetch dominates runtime (1 request per unique `tmdbId`).
- At ~2 requests/sec sustained: 50k IDs is many hours.
- Run in resumable chunks by `--startPage` and `--maxPages` (for example 1-200, 201-400, ...).

## Deterministic Execution
1. Discover pages are scanned in ascending page order.
2. Detail upserts run in sorted `tmdbId` order.
3. No randomness/sampling in ingestion path.
4. Local-only enforcement is active via `ensureLocalDatabaseOrThrow`.

## Recommended Execution Pattern
1. Dry run first:
`npm run expand:catalog:discover -- --startPage=1 --maxPages=200 --dryRun`
2. Persist in deterministic batches:
`npm run expand:catalog:discover -- --startPage=1 --maxPages=200`
`npm run expand:catalog:discover -- --startPage=201 --maxPages=200`
3. After expansion completes, run Season-specific assignment scripts separately.
