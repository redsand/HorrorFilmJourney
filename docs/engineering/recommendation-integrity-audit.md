# Recommendation Integrity Audit

Generated: 2026-03-05 (America/Chicago)

## Flow trace
- `POST /api/recommendations/next` calls `generateRecommendationBatch(auth.userId, prisma)` after authentication and telemetry logging, so every API request lands directly inside the recommendation engine (`src/app/api/recommendations/next/route.ts:3-27`).
- `generateRecommendationBatch` resolves the user’s active season/pack, syncs TMDB candidates, and switches between the legacy and modern pipelines. The modern path wires in `SqlCandidateGeneratorV1`, `HeuristicRerankerV1`, and `resolveJourneyNodeWithCapacity` while setting pack/season metadata from `resolveEffectivePackForUser` (`src/lib/recommendation/recommendation-engine.ts:1912-1970`, `src/lib/recommendation/recommendation-engine.ts:1350-1553`, and `src/lib/packs/pack-resolver.ts:78-115`).
- `SqlCandidateGeneratorV1` inspects the published release for the selected pack (`getPublishedSeasonNodeReleaseId`), honors the active journey node slug, and samples curated assignments before touching fallback movie pools so every candidate is evaluated against the curated catalog first (`src/lib/recommendation/recommendation-engine.ts:877-1076`).
- Once candidates are produced, `HeuristicRerankerV1` reapplies history/preferences, `explorationPolicy` may shuffle, and output movies are fetched with TMDB ratings + genre metadata, keeping metadata tied to the curated universe (`src/lib/recommendation/recommendation-engine.ts:1090-1290`).
- The finalized batch is persisted and returned to the API handler as movie card view models with linked `recommendationItemId`s for tracking and reruns (`src/lib/recommendation/recommendation-engine.ts:1666-1905`).

## Data sources
- Published node releases (`seasonNodeReleaseItem.releaseId`) drive the go-to candidate list when a release exists; the code grabs high-confidence `curatedAssignments` sorted by rank and filters to movies still eligible (`src/lib/recommendation/recommendation-engine.ts:977-1015`).
- When the release is unavailable, `nodeMovie` rows marked `tier: 'CORE'` provide the curated fallback so the same curated dataset backs recommendations even before a release is published (`src/lib/recommendation/recommendation-engine.ts:980-1005`).
- The `movie` table is queried with pack-constrained filters only when `usePackScopedPool` is true—that flag resolves to true whenever `hasPackCatalog` is true and the pack’s `primaryGenre` is not `horror`, so Season 1/2 packs that define `primaryGenre: 'horror'/'cult'` remain scoped (`src/lib/recommendation/recommendation-engine.ts:927-953`).
- Runtime ontology (`journeyNode` records) and capacity checks (`resolveJourneyNodeWithCapacity`) decide which node slug to honor before filtering curated assignments (`src/lib/recommendation/recommendation-engine.ts:1350-1529`).
- Runtime data sources are always tied to the curated pack: released batch metadata, `NodeMovie` assignments, and `movie` entries filtered by pack-specific genres and curator-tier validations (`src/lib/recommendation/recommendation-engine.ts:947-1015`).

## Precedence enforcement
- Published release items (source `seasonNodeReleaseItem`) are considered first; `curatedIds` is filled with high-confidence releases before falling back to the extended assignment ranking (`src/lib/recommendation/recommendation-engine.ts:977-1028`).
- Only if curated assignments shortfall does the engine append `extendedAssignments` and finally the broader `eligible` pool, where `eligible` is still scoped to the pack when `usePackScopedPool` is true (`src/lib/recommendation/recommendation-engine.ts:1009-1047`).
- `prioritizeCoreThenExtended` then merges curated IDs with fallback lists, guaranteeing published release data wins over fallback candidates (`src/lib/recommendation/core-tier.ts:1-40` referenced indirectly from `src/lib/recommendation/recommendation-engine.ts:1034-1045`).

## Leak detection
- When `hasPackCatalog` is false (missing release and no `NodeMovie` rows), `usePackScopedPool` becomes false so `allMovies` queries the full `movie` table with only the genre filter, leaving a window for non-season entries to slip in. Season packs should always publish a release or maintain `NodeMovie` data before running updates to avoid that path (`src/lib/recommendation/recommendation-engine.ts:909-952`).
- The modern engine still enforces poster/ratings and history deduplication, so even that fallback path is guarded, but it yields an empty batch if the curated catalog is empty (see simulation below).

## Simulations & coverage
- Season 1 curated slots: `tests/prisma/recommendation-engine-modern.test.ts:81-146` seeds journey nodes/movies for Season 1, runs `generateRecommendationBatch`, and asserts every card matches the curated `NodeMovie` set—proving Season 1 nodes drive the output.
- Season 2 empty-catalog guard: `tests/prisma/recommendation-engine-modern.test.ts:189-212` enables the cult-classics pack without seeding Season 2 movies and verifies the batch stays empty, confirming the engine does not fall back to arbitrary titles when the curated dataset is absent.
- Repeat avoidance and rating/poster requirements (remaining tests in the same file) confirm the pipeline never returns recently recommended titles or underqualified posters even when the fallback path runs (`tests/prisma/recommendation-engine-modern.test.ts:1-79`).

## Observations / next actions
- Always run `npm run publish:seasonX` (or the corresponding release import) before `update:seasons` so `hasPackCatalog` stays true and the `usePackScopedPool` guard keeps every recommendation inside the curated season dataset.
- Deploy pipelines should continue to surface warnings if a release contains fewer than `targetCount` movies so `curatedIds.length >= targetCount` is satisfied; otherwise, the fallback logic makes the last resort candidate pool larger and potentially less curated.
- Keep the recommendation diagnostics (`prisma.recommendationDiagnostics`) enabled so troubleshooting can confirm that batches hitting the fallback path still respect the curated/extended/eligible priorities tracked in `diversityStats`.
