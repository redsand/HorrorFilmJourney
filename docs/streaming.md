# Streaming lookup and caching

`StreamingLookupService` resolves streaming offers per movie and region, with database-backed caching.

## Rules

- `MovieCardVM.streaming` must always exist in API responses.
- `streaming.offers` can be an empty array when data is unknown or unavailable.
- Cache TTL is **7 days**.
- Lookup is region-aware; default region is **`US`**.

## Provider interface

Streaming data providers stay behind `StreamingProvider`:

- `lookup(tmdbId, region) => Promise<StreamingOffer[]>`

Current implementation uses `DeterministicStubStreamingProvider` for test/dev stability and deterministic outputs.

## Cache storage

Cache is stored in `MovieStreamingCache` with unique key `(movieId, region)`.

- `offers` stores normalized streaming offer payloads.
- `fetchedAt` is compared with current time to enforce 7-day TTL.
- Fresh cache entries are returned without provider calls.
- Stale or missing cache entries trigger provider lookup and cache upsert.

## Failure behavior

- Provider failures must not break recommendation responses.
- On provider error, lookup returns `offers: []` and stores that result in cache with current `fetchedAt`.
