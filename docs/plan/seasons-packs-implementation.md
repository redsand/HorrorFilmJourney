# Seasons + Packs Implementation Plan (Smallest-Change)

## Goal

Launch **Season 1: Horror** with a forward-compatible seam for future packs, minimizing risk and avoiding large rewrites.

## Design constraints from current architecture

- Recommendations already depend on `Movie.genres` and TMDB-synced horror-heavy catalog.
- Onboarding persists to `UserProfile`.
- Experience state and recommendation retrieval are user-centric and batch-centric.
- Progress and diagnostics already exist and should be pack-aware later.

## Proposed data model (phase rollout)

## Phase A (scaffolding - no DB migration)
- Add feature flag `SEASONS_PACKS_ENABLED` (default `false`).
- Add read-only `GET /api/packs` returning hard-coded Season 1 Horror.

## Phase B (DB-backed core)
- Add `Season`:
  - `id`, `slug` (unique), `name`, `isActive`, timestamps
- Add `GenrePack`:
  - `id`, `slug` (unique), `name`, `seasonId`, `isEnabled`, `primaryGenre`, `description`, timestamps
- Add `UserProfile.selectedPackId` (nullable initially; backfilled to Horror)
- Add `RecommendationBatch.packId` (nullable initially; backfilled by user default)
- Add `JourneyProgress.packId` and include in uniqueness:
  - from `(userId, journeyNode)` -> `(userId, packId, journeyNode)`

## Answering required decisions

### A) Where to store selected pack?
- `UserProfile.selectedPackId` (recommended), because onboarding/profile already persist user preference state.

### B) How engine filters by pack?
- Initial implementation: derive pack filter from `GenrePack.primaryGenre` and existing `Movie.genres`.
- For Season 1 Horror:
  - include movies where `Movie.genres` contains `horror` (plus existing eligibility checks).
- Later extension:
  - optional pack-specific eligibility table or tag map for richer curation.

### C) Prevent cross-pack contamination?
- Scope generated batches by `RecommendationBatch.packId`.
- Scope progress by `JourneyProgress.packId`.
- Keep `UserMovieInteraction` global history but compute per-pack history views using joins through batch/movie genre mapping.
- Recommendation exclusion logic should prioritize:
  - strict within-pack exclusions for seen/recent skip.
  - optional global damping (configurable) for cross-pack novelty control.

### D) Existing users migration
- Backfill strategy:
  - create Season 1 + Horror pack row
  - set `UserProfile.selectedPackId = horrorPackId` for existing users
  - keep nullable-compatible code path until backfill completes
- Runtime fallback:
  - if no selected pack, default to Horror pack.

### E) Admin controls now vs later
- **Now:** none required for launch safety (hard-coded or seeded single active pack).
- **Later:** admin CRUD/activation:
  - season activation
  - pack enable/disable
  - user pack reassignment for support tools

## Migration plan (minimal breakage)

1. Add new tables `Season` and `GenrePack` (no behavior switch yet).
2. Seed Season 1 + Horror pack.
3. Add nullable `UserProfile.selectedPackId`, `RecommendationBatch.packId`, and `JourneyProgress.packId`.
4. Backfill existing users + existing/new batches with Horror pack.
5. Switch recommendation generation to resolve effective pack from profile.
6. Add not-null constraints only after backfill + runtime fallback confirmed in production-like validation.

## API plan

### Scaffolding now
- `GET /api/packs`
  - returns active season + enabled packs
  - hard-coded Season 1 Horror response

### Next phase
- Onboarding update:
  - accept optional `selectedPackSlug`/`selectedPackId`
  - persist to `UserProfile.selectedPackId`
- Potential profile endpoint:
  - `PATCH /api/profile/preferences` to change selected pack
- Admin APIs (later):
  - activate/deactivate packs/seasons

## UI plan

### Scaffolding now
- no UI behavior change required

### Next phase
- Onboarding:
  - add pack selection step (Horror preselected initially)
- Landing:
  - messaging can include “Season 1: Horror”
- Profile:
  - show current selected pack and allow switching (later once multiple packs exist)

## Recommendation pipeline integration points

- Current entry: `src/app/api/recommendations/next/route.ts`
- Core logic: `src/lib/recommendation/recommendation-engine.ts`
- Filter seam:
  - inject effective pack context near candidate generation stage
  - keep existing scoring/rerank unchanged initially
- Persist pack on batch:
  - include `packId` when creating `RecommendationBatch`

## Test plan

### Unit
- Pack resolver default logic:
  - no selection -> Horror default
- Candidate filter by pack genre tag

### API integration
- `GET /api/packs` shape + auth convention
- onboarding/profile pack persistence endpoints (phase B)

### E2E
- user onboarding with default Horror pack
- recommendations generated within selected pack
- progress/history remain coherent after pack switch (when multi-pack exists)

## Backward compatibility strategy

- Keep nullable fields during transition.
- Runtime fallback always available:
  - missing `selectedPackId` => Horror
  - missing `packId` on old batches => treated as Horror for reads
- No breaking endpoint contract in scaffolding phase.

## Next steps after scaffolding PR

1. Add DB models + migration/backfill for Season/GenrePack and profile/batch/progress pack references.
2. Wire onboarding/profile preference to pack selection.
3. Inject pack filtering into recommendation candidate query path.
4. Add pack-scoped progression/history behavior.
5. Add admin controls once >1 pack is introduced.
