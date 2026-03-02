# Multi-user data model (Prisma + SQLite)

This app now uses a multi-user schema with Prisma as source of truth.

## Models

- **User**
  - `id` (cuid)
  - `displayName`
  - `createdAt`, `updatedAt`

- **UserProfile** (1:1 with User)
  - `userId` unique
  - `tolerance` (`1..5`, default `3` at app level)
  - `pacePreference` (optional)
  - `horrorDNA` (JSON, optional)

- **Movie**
  - `tmdbId` unique integer
  - `title`
  - `year` optional
  - `posterUrl` optional
  - `genres` JSON optional
  - `director` optional
  - `castTop` JSON optional

- **UserMovieInteraction**
  - `userId`, `movieId`
  - `status`: `WATCHED | ALREADY_SEEN | SKIPPED | WANT_TO_WATCH`
  - optional fields: `rating`, `intensity`, `emotions`, `workedBest`, `agedWell`, `recommend`, `note`
  - `recommendationItemId` optional
  - `createdAt`
  - index on `(userId, createdAt)`

- **RecommendationBatch**
  - `userId`
  - `journeyNode` optional
  - `rationale` optional
  - `createdAt`
  - index on `(userId, createdAt)`

- **RecommendationItem**
  - `batchId`, `movieId`
  - `rank`
  - narrative fields:
    - `whyImportant`, `whatItTeaches`, `historicalContext`, `nextStepHint`
    - `watchFor` (JSON)
    - `reception` (JSON optional)
    - `castHighlights` (JSON optional)
    - `streaming` (JSON optional)
    - `spoilerPolicy`
  - unique `(batchId, movieId)`

## Auth boundary (current internal mode)

All routes should enforce:

1. `x-admin-token` must match `ADMIN_TOKEN`
2. `x-user-id` must be present and map to an existing `User`

If user resolution fails, routes return:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "..."
  }
}
```
