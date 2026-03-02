# API Reference (internal)

All responses use the stable envelope:

- Success: `{ "data": ..., "error": null }`
- Error: `{ "data": null, "error": { "code": "...", "message": "...", "details"?: ... } }`

## Required headers

- All routes: `x-admin-token: <ADMIN_TOKEN>`
- User-scoped routes (everything except `/api/users` and `/api/health`):
  - `x-user-id: <existing user id>`

---

## POST /api/movies/upsert

Upsert a movie by TMDB id.

### Body

```json
{
  "tmdbId": 603,
  "title": "The Matrix",
  "posterUrl": "https://image.tmdb.org/t/p/w500/...jpg",
  "year": 1999,
  "genres": ["sci-fi", "action"],
  "ratings": [
    { "source": "IMDB", "rawValue": "8.7/10" },
    { "source": "ROTTEN_TOMATOES", "rawValue": "83%" },
    { "source": "METACRITIC", "rawValue": "73/100" }
  ]
}
```

### Rules

- `posterUrl` is required and must be non-empty.
- `ratings` is optional, but if provided each item must contain `{ source, rawValue }`.
- Supported normalization sources: `IMDB`, `ROTTEN_TOMATOES`, `METACRITIC`, `TMDB`.

### Success

```json
{
  "data": {
    "id": "...",
    "tmdbId": 603,
    "title": "The Matrix",
    "year": 1999,
    "posterUrl": "https://...",
    "genres": ["sci-fi", "action"],
    "ratings": [
      { "source": "IMDB", "value": 8.7, "scale": "10", "rawValue": "8.7/10" }
    ]
  },
  "error": null
}
```

---

## POST /api/recommendations/next

Generates the next recommendation batch for the current user.

### Success (shape)

```json
{
  "data": {
    "batchId": "...",
    "cards": [
      {
        "id": "...",
        "rank": 1,
        "movie": {
          "tmdbId": 603,
          "title": "The Matrix",
          "year": 1999,
          "posterUrl": "https://..."
        },
        "ratings": {
          "imdb": { "value": 8.7, "scale": "10", "rawValue": "8.7/10" },
          "additional": [
            { "source": "ROTTEN_TOMATOES", "value": 83, "scale": "100", "rawValue": "83%" }
          ]
        },
        "narrative": {
          "whyImportant": "...",
          "whatItTeaches": "...",
          "watchFor": ["...", "...", "..."],
          "historicalContext": "...",
          "ratings": {
            "imdb": { "value": 8.7, "scale": "10" },
            "additional": [{ "source": "ROTTEN_TOMATOES", "value": 83, "scale": "100" }]
          }
        }
      }
    ]
  },
  "error": null
}
```

Guarantees:

- `movie.posterUrl` is non-null.
- `ratings.imdb` is present.
- at least two total rating systems are shown (`imdb` + one additional).
- `evidence` key is always present on each recommendation card (`[]` when no evidence exists).


## GET /api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS|LIGHT|FULL

Companion Mode endpoint for in-movie mobile usage.

Required headers:

- `x-admin-token: <ADMIN_TOKEN>`
- `x-user-id: <existing user id>`

### Query params

- `tmdbId` (required integer)
- `spoilerPolicy` (optional; defaults to `NO_SPOILERS`)

### Success (shape)

```json
{
  "data": {
    "movie": { "tmdbId": 123, "title": "...", "year": 1999, "posterUrl": "https://..." },
    "credits": {
      "director": "...",
      "cast": [{ "name": "...", "role": "..." }]
    },
    "sections": {
      "productionNotes": ["..."],
      "historicalNotes": ["..."],
      "receptionNotes": ["..."],
      "trivia": ["..."]
    },
    "spoilerPolicy": "NO_SPOILERS",
    "evidence": [
      { "sourceName": "...", "url": "https://...", "snippet": "...", "retrievedAt": "2026-01-01T00:00:00.000Z" }
    ]
  },
  "error": null
}
```

### Spoiler behavior

- `NO_SPOILERS`: general non-spoiler notes only.
- `LIGHT`: mild thematic/craft hints are allowed.
- `FULL`: spoiler-rich notes are allowed.


## POST /api/evidence/upsert

Admin-only evidence packet upsert for web support/citation grounding.

### Body

```json
{
  "tmdbId": 123,
  "sourceName": "Wikipedia",
  "url": "https://example.com",
  "snippet": "Short evidence excerpt",
  "retrievedAt": "2026-01-01T00:00:00.000Z"
}
```

### Rules

- Dedupes evidence by `(movieId, sourceName, url, snippet-hash)`.
- Repeated upserts for same dedupe key update `retrievedAt` instead of creating duplicates.
- `url` is optional.

### Success

Returns stored evidence packet in standard envelope.
