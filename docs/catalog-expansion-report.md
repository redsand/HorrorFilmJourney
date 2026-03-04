# Catalog Expansion Report

Generated: 2026-03-04

## Scope

Expanded catalog ingestion path without changing Season 1 assignment logic.

## TMDB Discover Audit (`/scripts`)

`with_genres` usage found:

- `scripts/sync-tmdb-catalog.ts` uses `with_genres` (genre-filtered full sync).
- `scripts/seed-season2-cult-curriculum.ts` uses `with_genres` (Season 2 specific candidate fetch).

No-genre discover path:

- `scripts/expand-catalog-discover.ts` uses `/discover/movie` with `sort_by=popularity.desc` and **no** `with_genres` / `without_genres`.

## Implemented Expansion Flow

Script: `scripts/expand-catalog-discover.ts`

Flow:

1. Fetch discover pages `startPage..startPage+maxPages-1` (capped at TMDB max 2000 pages).
2. Deduplicate discover results by `tmdbId`.
3. Phase 1 (minimal ingest): upsert minimal movie records from discover payload.
4. Phase 2 (enrichment): fetch `/movie/{id}?append_to_response=keywords,credits` and enrich metadata/ratings.
5. Write deterministic summary artifact.

Determinism controls:

- Stable ordering by sorted `tmdbId` before persistence.
- Explicit CLI options (`startPage`, `maxPages`, `outputDir`).
- No Season 1 assignment side effects.

## Run Executed

Command:

```bash
npm run expand:catalog:discover -- --startPage=1 --maxPages=10 --outputDir=artifacts/catalog-expansion/2026-03-04T17-49-14Z
```

Summary artifact:

- `artifacts/catalog-expansion/2026-03-04T17-49-14Z/summary.json`

Key results:

- pagesFetched: `10`
- discoverMoviesSeen: `200`
- uniqueTmdbIdsFromDiscover: `180`
- minimalUpsertedMovies: `179`
- enrichedMovies: `179`
- dbMovieCount: `22546`

## Notes

- This expansion path is local-only (enforced by local DB guard).
- It does not seed or publish any Season 1 node assignments.
