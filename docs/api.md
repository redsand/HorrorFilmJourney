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
