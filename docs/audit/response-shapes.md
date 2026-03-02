# Response Shape Audit: `POST /api/recommendations/next`

## Route handler location

- Handler: `src/app/api/recommendations/next/route.ts`
- Function: `POST(request: Request): Promise<Response>`

## Current envelope shape

The route returns the shared envelope from `ok()` in `src/lib/api-envelope.ts`:

```json
{
  "data": {
    "batchId": "string",
    "cards": ["MovieCardVM", "..."]
  },
  "error": null
}
```

Error responses use:

```json
{
  "data": null,
  "error": {
    "code": "string",
    "message": "string",
    "details": "unknown?"
  }
}
```

## Types and validation used today

- Route-level explicit TS response type alias: **none**.
- Runtime shaping:
  - `generateRecommendationBatch(...)` engine output.
  - `toMovieCardVM(...)` adapter maps to canonical card shape.
- Runtime validation:
  - `toMovieCardVM` validates with `zMovieCardVMArray.parse(cards)` (Zod).

## Card object shape returned today

Cards are canonical `MovieCardVM` objects with these top-level keys:

- `movie`
- `ratings`
- `reception`
- `credits`
- `streaming`
- `codex`
- `evidence`

Notable behavior in adapter:

- `streaming.region` is always set to `"US"`.
- `streaming.offers` always exists (may be empty).
- `reception` always exists; fallback summary when aggregates are absent is:
  - `"Reception data currently unavailable."`

## Missing fields vs MovieCardVM spec

Compared with `src/contracts/movieCardVM.ts`, no required top-level sections are missing.

Potentially optional/commonly absent fields (by design):

- `reception.critics` and `reception.audience` may be absent.
- `credits.director` may be absent.
- `movie.year` may be absent.
- `reception.summary` may vary based on available aggregates and narrative input.

## Snapshot specimen

- Deterministic specimen test: `tests/acceptance/recommendations-shape-snapshot.test.ts`
- Snapshot output path: `docs/snapshots/recommendations-next.sample.json`
