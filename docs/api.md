# API Reference (internal)

All responses use the stable envelope:

- Success: `{ "data": ..., "error": null }`
- Error: `{ "data": null, "error": { "code": "...", "message": "...", "details"?: ... } }`

## Authentication

- Use cookie-session auth from `/api/auth/signup` and `/api/auth/login`.
- Protected routes return:
  - `401` when session cookie is missing/invalid.
  - `403` for admin routes when user is not admin.

---

## GET /api/packs

Returns the currently available season/packs selection payload.

### Auth

- Requires valid session cookie.

### Feature flag

- Controlled by `SEASONS_PACKS_ENABLED` (default `false`).
- Scaffolding behavior currently returns Season 1 Horror payload in both flag states.

### Success

```json
{
  "data": {
    "activeSeason": { "slug": "season-1", "name": "Season 1" },
    "packs": [
      {
        "slug": "horror",
        "name": "Horror",
        "isEnabled": true,
        "seasonSlug": "season-1"
      }
    ]
  },
  "error": null
}
```

---

## POST /api/profile/select-pack

Set the authenticated user's active pack for the active season.

### Auth

- Requires valid session cookie.

### Body

```json
{
  "packSlug": "horror"
}
```

Alternative:

```json
{
  "packId": "pack_cuid"
}
```

### Rules

- Pack must be `isEnabled=true`.
- Pack must belong to active season.
- Returns `400` if pack is unavailable/disabled.

### Success

```json
{
  "data": {
    "success": true,
    "pack": {
      "id": "pack_cuid",
      "slug": "horror",
      "seasonSlug": "season-1"
    }
  },
  "error": null
}
```

---

## PATCH /api/profile/password

Change the authenticated user's password.

### Auth

- Requires valid session cookie.

### Body

```json
{
  "currentPassword": "current-password",
  "newPassword": "new-strong-password"
}
```

### Rules

- `currentPassword` is required, minimum length `8`.
- `newPassword` is required, minimum length `8`.
- `newPassword` must differ from `currentPassword`.
- Returns `400` if current password does not match existing credential.

### Success

```json
{
  "data": { "success": true },
  "error": null
}
```

---

## GET /api/experience

Returns current UX state for authenticated user.

### States

- `PACK_SELECTION_NEEDED` when packs are enabled and `selectedPackId` is missing.
- `ONBOARDING_NEEDED` when onboarding is not completed.
- `SHOW_RECOMMENDATION_BUNDLE`
- `SHOW_QUICK_POLL`
- `SHOW_HISTORY`

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

---

## POST /api/onboarding

Upserts onboarding profile answers for the current user.

### Body

```json
{
  "tolerance": 4,
  "pacePreference": "balanced",
  "selectedPackSlug": "horror",
  "horrorDNA": {
    "subgenres": ["psychological", "supernatural"]
  }
}
```

### Rules

- `tolerance` is required and must be an integer `1..5`.
- `pacePreference` is required and must be one of: `slowburn`, `balanced`, `shock`.
- `selectedPackSlug` is optional (used when seasons/packs are enabled).
- Existing profile is updated if present; otherwise created.

### Success

```json
{
  "data": { "success": true },
  "error": null
}
```


## GET /api/companion?tmdbId=123&spoilerPolicy=NO_SPOILERS|LIGHT|FULL

Companion Mode endpoint for in-movie mobile usage.

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
      "techniqueBreakdown": ["..."],
      "influenceMap": ["..."],
      "afterWatchingReflection": ["..."],
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
- Policy also controls summary depth and reflection prompt framing.

### Structured depth sections

- `sections.techniqueBreakdown`: cinematography, score, and editing rhythm prompts.
- `sections.influenceMap`: predecessor films, director lineage, and genre lineage cues.
- `sections.afterWatchingReflection`: exactly 3 short prompts, personalized from user DNA when available.

### Credits fallback behavior

- If `Movie.director` is known, `credits.director` is included.
- If `Movie.castTop` has entries, `credits.cast` is populated from it.
- If credits data is missing, `credits.cast` is an empty array and sections include a note that credits metadata is limited.


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

---

## POST /api/feedback

Create feedback for the currently authenticated user.

### Auth

- Requires valid session cookie.

### Body

```json
{
  "type": "BUG",
  "category": "UX",
  "title": "Poster cards are blank",
  "description": "On Journey, poster image fails to render for all five cards.",
  "route": "/journey"
}
```

### Rules

- `type` is required: `BUG | IDEA | CONFUSION | OTHER`
- `title` is required, minimum length `5`
- `description` is required, minimum length `10`
- `category` is optional
- `route` is optional; server also accepts `X-Current-Route` header fallback
- `userAgent` is auto-captured from request headers

### Success

```json
{
  "data": { "id": "feedback_cuid" },
  "error": null
}
```

---

## GET /api/admin/packs

Admin-only list of seasons and packs.

### Auth

- Requires admin session cookie.

### Success

```json
{
  "data": {
    "activeSeason": {
      "id": "season_id",
      "slug": "season-1",
      "name": "Season 1",
      "isActive": true,
      "packs": []
    },
    "seasons": []
  },
  "error": null
}
```

---

## PATCH /api/admin/packs

Admin-only: set active season.

### Body

```json
{
  "seasonSlug": "season-1"
}
```

---

## PATCH /api/admin/packs/:id

Admin-only: enable/disable pack.

### Body

```json
{
  "isEnabled": false
}
```

### Rules

- Cannot disable the last enabled pack in active season.

---

## GET /api/admin/curriculum

Admin-only curriculum visibility for all seasons, packs, and node coverage quality.

### Auth

- Requires admin session cookie.

### Success

```json
{
  "data": {
    "activeSeason": {
      "id": "season_id",
      "slug": "season-1",
      "name": "Season 1"
    },
    "packs": [
      {
        "id": "pack_id",
        "slug": "horror",
        "name": "Horror",
        "isEnabled": true,
        "totalAssignedTitles": 80,
        "duplicateTitlesCount": 0,
        "duplicateRatePct": 0,
        "duplicateTmdbIds": [],
        "nodes": [
          {
            "id": "node_id",
            "slug": "foundations-early-horror",
            "name": "Foundations: Silent & Early Horror",
            "orderIndex": 1,
            "totalTitles": 10,
            "eligibleTitles": 10,
            "missingPosterCount": 0,
            "missingRatingsCount": 0,
            "missingReceptionCount": 0,
            "missingCreditsCount": 0,
            "missingStreamingCount": 0,
            "eligibilityCoverage": 100,
            "titles": [
              {
                "id": "movie_id",
                "rank": 1,
                "tmdbId": 7001,
                "title": "Nosferatu",
                "posterUrl": "https://...",
                "isEligible": true,
                "completenessTier": "ENRICHED",
                "missing": {
                  "poster": false,
                  "ratings": false,
                  "reception": false,
                  "credits": false,
                  "streaming": false
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "error": null
}
```

### Notes

- Endpoint is read-only visibility for launch tuning.
- Eligibility warnings are derived from poster/ratings/reception/credits availability.
- Streaming gaps are reported separately (`missingStreamingCount`) for UX completeness tracking.
- Disabled packs return with a warning in admin UI and remain hidden from onboarding.

---

## GET /api/admin/feedback

List feedback (admin-only) with filtering and cursor pagination.

### Auth

- Requires admin session cookie.

### Query params

- `status`: `OPEN | IN_REVIEW | FIXED | ARCHIVED`
- `type`: `BUG | IDEA | CONFUSION | OTHER`
- `priority`: `LOW | MEDIUM | HIGH | CRITICAL`
- `search`: case-insensitive match on title/description/category
- `cursor`: feedback id cursor for pagination
- `limit`: `1..100` (default `25`)

### Success

```json
{
  "data": {
    "items": [
      {
        "id": "feedback_cuid",
        "type": "BUG",
        "status": "OPEN",
        "priority": "MEDIUM",
        "title": "Poster cards are blank",
        "description": "...",
        "user": {
          "id": "user_cuid",
          "displayName": "Tim",
          "email": "tim@example.com"
        }
      }
    ],
    "nextCursor": null
  },
  "error": null
}
```

---

## PATCH /api/admin/feedback/:id

Update feedback status/priority (admin-only).

### Auth

- Requires admin session cookie.

### Body

```json
{
  "status": "IN_REVIEW",
  "priority": "HIGH"
}
```

At least one of `status` or `priority` is required.

### Success

```json
{
  "data": {
    "id": "feedback_cuid",
    "status": "IN_REVIEW",
    "priority": "HIGH"
  },
  "error": null
}
```

---

## DELETE /api/admin/feedback/:id

Delete feedback (admin-only).

### Auth

- Requires admin session cookie.

### Success

```json
{
  "data": {
    "id": "feedback_cuid",
    "deleted": true
  },
  "error": null
}
```
