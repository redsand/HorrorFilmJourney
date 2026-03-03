# Seasons + Packs Discovery

## 1) Repo layout (current)

### Top-level
- `src/`
- `prisma/`
- `scripts/`
- `tests/`
- `docs/`
- `middleware.ts`
- `package.json`

### `src/` high-level
- App routes/pages: `src/app/*`
- API routes: `src/app/api/*`
- Recommendation/domain logic: `src/lib/recommendation/*`
- Auth: `src/lib/auth/*`
- Taste/DNA/progression: `src/lib/taste/*`, `src/lib/journey/*`
- UI components: `src/components/*`
- Contracts: `src/contracts/*`

## 2) Prisma current state (relevant models)

Source: `prisma/schema.prisma`

### Movie / ratings / reception / credits related
- `Movie`
  - `tmdbId`, `title`, `year`, `posterUrl`, `posterLastValidatedAt`
  - `genres` (`Json?`)
  - `director` (`String?`)
  - `castTop` (`Json?`)
- `MovieRating`
  - per-source ratings (`source`, `value`, `scale`, `rawValue`)
- `EvidencePacket`
- `MovieStreamingCache`
- `CompanionCache`
- Narrative/recs storage in `RecommendationItem`:
  - `reception` (`Json?`)
  - `castHighlights` (`Json?`)
  - `streaming` (`Json?`)

### User / auth / roles / profile/preferences
- `User`
- `UserCredential`
  - email/password hash, `isAdmin`
- `UserProfile`
  - `onboardingCompleted`, `tolerance`, `pacePreference`, `horrorDNA`

### Recommendation + progression + DNA
- `RecommendationBatch`
  - `userId`, `journeyNode`, `rationale`
- `RecommendationItem`
  - per-card narrative + metadata
- `RecommendationDiagnostics`
- `JourneyProgress`
- `UserTasteProfile`
- `TasteSnapshot`
- `UserMovieInteraction`
- `UserEmbeddingSnapshot`, `MovieEmbedding`

### Admin-related data
- No separate admin model; admin is role flag on `UserCredential.isAdmin`.
- New operational model: `Feedback` with status/priority and metadata.

## 3) Where “genre” is represented today

- `Movie.genres` JSON array (primary storage): `prisma/schema.prisma`
- Normalization helpers:
  - `normalizeGenres(...)` in `src/lib/recommendation/recommendation-engine-v1.ts`
  - genre usage throughout modern reranker in `src/lib/recommendation/recommendation-engine.ts`
- TMDB ingest maps genre IDs -> text tags:
  - `GENRE_NAME_BY_ID` in `src/lib/tmdb/live-candidate-sync.ts`
- Subgenre read API:
  - `GET /api/movies/subgenres` in `src/app/api/movies/subgenres/route.ts` reads `Movie.genres`.

## 4) Recommendation generation and filtering today

### Entry point
- `POST /api/recommendations/next`: `src/app/api/recommendations/next/route.ts`
  - requires auth via `requireAuth`
  - calls `generateRecommendationBatch(...)`
  - converts to VM via `toMovieCardVM(...)`

### Engines
- Modern wrapper + pipeline: `src/lib/recommendation/recommendation-engine.ts`
- Legacy/v1 pipeline: `src/lib/recommendation/recommendation-engine-v1.ts`

### Filtering rules (current)
- Excludes prior user interactions:
  - seen/watched and recent skipped
- Excludes latest batch movies (v1 path)
- Eligibility requires:
  - poster URL quality checks
  - IMDb present
  - minimum rating source count (`MIN_RATING_SOURCES_FOR_ELIGIBILITY = 3`)
- Candidate sync pulls TMDB horror candidates before generation:
  - `syncTmdbHorrorCandidates(...)` in `src/lib/tmdb/live-candidate-sync.ts`

### Reranking + diagnostics
- Modern reranker blends:
  - popularity components
  - DNA score
  - novelty + exploration
  - user preference style (`diversity` / `popularity` from `horrorDNA.recommendationStyle`)
- Diagnostics persisted into `RecommendationDiagnostics.diversityStats`.
- Admin diagnostics endpoint:
  - `GET /api/recommendations/[batchId]/diagnostics` in `src/app/api/recommendations/[batchId]/diagnostics/route.ts`

## 5) Onboarding persistence today

- API route:
  - `POST /api/onboarding` in `src/app/api/onboarding/route.ts`
- Validation:
  - Zod schema (`tolerance`, `pacePreference`, optional `horrorDNA`)
- DB writes:
  - upsert into `UserProfile`
  - sets `onboardingCompleted = true`
  - persists `tolerance`, `pacePreference`, merged `horrorDNA`

### Related preference endpoint
- `GET/PATCH /api/profile/preferences` in `src/app/api/profile/preferences/route.ts`
  - persists recommendation style in `UserProfile.horrorDNA.recommendationStyle`

## 6) UI locations (current)

### Landing + auth redirect
- Landing: `src/app/page.tsx`
  - reads session cookie + user existence
  - redirects authenticated users to `/journey`
  - unauth users see marketing page with signup/login/demo CTAs

### Journey and onboarding UI
- Journey page: `src/app/journey/page.tsx`
  - fetches `/api/experience`
  - renders onboarding form when `ONBOARDING_NEEDED`
  - onboarding submit posts to `/api/onboarding`
  - bundle UI uses `RecommendationBundle`

### Other primary screens
- History: `src/app/history/page.tsx`
- Companion: `src/app/companion/[tmdbId]/page.tsx`
- Profile: `src/app/profile/page.tsx`
- DNA/progression pages: `src/app/profile/dna/page.tsx`, `src/app/profile/progression/page.tsx`
- Admin pages: `src/app/admin/users/page.tsx`, `src/app/admin/feedback/page.tsx`

### Auth + route protection
- Cookie auth guards: `src/lib/auth/guards.ts`
- Middleware admin protection: `middleware.ts`
  - protects `/admin/*`
  - `/login` and `/signup` are public

## 7) Seeds / bootstrap / sync scripts

- Admin bootstrap:
  - `scripts/bootstrap-admin.ts`
- Catalog seed:
  - `scripts/seed-catalog.ts`
  - seed logic in `src/lib/testing/catalog-seed.ts`
- TMDB sync scripts:
  - `scripts/sync-tmdb-catalog.ts`
  - `scripts/sync-tmdb-catalog-update.ts`
- Backup/restore:
  - `scripts/catalog-backup.ts`
  - `scripts/catalog-restore.ts`

## 8) Tests and DB handling

### Test suites
- Unit: `tests/unit/*`
- API route tests: `tests/api/*`
- Prisma integration: `tests/prisma/*`
- Acceptance: `tests/acceptance/*`
- E2E: `tests/e2e/*`

### DB strategy
- Test helper URL builder:
  - `tests/helpers/test-db.ts`
- Reset script:
  - `scripts/reset-test-db.ts` (drop/create schema + `prisma db push` + seed)
- E2E setup script:
  - `scripts/setup-test.ts`
- RC runner:
  - `scripts/validate-rc.ts`

### Env usage
- Uses `DATABASE_URL`, `DATABASE_URL_TEST`, and `TEST_DATABASE_URL` in scripts/tests.

## 9) Gap summary for Seasons + Packs

- No pack/season models exist yet.
- No `packId` on `UserProfile`, `RecommendationBatch`, or `JourneyProgress`.
- Filtering is currently genre/rules based, but not pack-scoped.
- Progress/history are user-scoped only, not pack-scoped.
