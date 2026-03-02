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
  "year": 1999,
  "posterUrl": "https://...",
  "genres": ["sci-fi", "action"]
}
```

### Success

```json
{
  "data": {
    "id": "...",
    "tmdbId": 603,
    "title": "The Matrix",
    "year": 1999,
    "posterUrl": "https://...",
    "genres": ["sci-fi", "action"]
  },
  "error": null
}
```

---

## POST /api/interactions

Create a user-scoped movie interaction.

### Body

```json
{
  "tmdbId": 603,
  "status": "WATCHED",
  "rating": 5,
  "intensity": 4,
  "emotions": ["dread", "excitement"],
  "workedBest": ["pacing", "practical effects"],
  "agedWell": "Still effective",
  "recommend": true,
  "note": "Great rewatch",
  "recommendationItemId": "optional-item-id"
}
```

### Rules

- `WATCHED` and `ALREADY_SEEN` require `rating` (`1..5`).
- `SKIPPED` and `WANT_TO_WATCH` do not require `rating`.

---

## GET /api/history?status=&limit=&cursor=

Returns current user's interactions, newest first, including movie summary.

### Example

`GET /api/history?status=WATCHED&limit=20`

### Success

```json
{
  "data": [
    {
      "id": "...",
      "status": "WATCHED",
      "rating": 5,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "movie": {
        "tmdbId": 603,
        "title": "The Matrix",
        "year": 1999,
        "posterUrl": "https://..."
      }
    }
  ],
  "error": null
}
```


---

## GET /api/experience

Returns backend-driven per-user experience state (`ONBOARDING_NEEDED`, `SHOW_RECOMMENDATION_BUNDLE`, `SHOW_QUICK_POLL`, `SHOW_HISTORY`) with payload for the next screen.

Requires:

- `x-admin-token`
- `x-user-id`
