# Multi-user data model (Prisma + PostgreSQL)

This app uses Prisma as source of truth and now enforces richer movie metadata for recommendation eligibility.

## Core models

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
  - `posterUrl` **required**
  - `posterLastValidatedAt` optional timestamp
  - `genres` JSON optional
  - `director` optional
  - `castTop` JSON optional

- **MovieRating**
  - `movieId`
  - `source` (e.g. `IMDB`, `ROTTEN_TOMATOES`, `METACRITIC`, `TMDB`)
  - `value` (normalized numeric score)
  - `scale` (e.g. `10`, `100`, `5`)
  - `rawValue` (optional original display value, e.g. `92%`, `7.8/10`)
  - `updatedAt`
  - unique `(movieId, source)`

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

## Recommendation eligibility constraints

A movie is eligible for recommendation only if it has:

1. non-empty `posterUrl`
2. at least **3** rating entries in `MovieRating`
3. one rating source with `source = "IMDB"`

Movies missing these requirements are excluded from candidate sets.
